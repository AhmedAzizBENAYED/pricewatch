import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_plan, require_role
from src.common.models.rapport import Rapport

router = APIRouter(prefix="/reports", dependencies=[Depends(require_plan('MEDIUM'))])

_ROLES = ("RESP_MARKETING", "MANAGER")
REPORTS_DIR = "/app/reports"


# ── Schemas ────────────────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    titre:        str
    type:         str               # HEBDOMADAIRE | MENSUEL | PERSONNALISE
    format:       str               # PDF | EXCEL
    sections:     list[str] = []
    periode_debut: Optional[str] = None
    periode_fin:   Optional[str] = None


def _analysis_fields(r: Rapport) -> dict:
    """Extract score/tendance/opportunites/tools_used from JSONB columns."""
    ad = r.analysis_data or {}
    pd = r.plan_data     or {}
    return {
        "score_concurrentiel": ad.get("score_concurrentiel"),
        "tendance":            ad.get("tendance"),
        "opportunites":        ad.get("opportunites"),
        "tools_used":          ad.get("tools_used") or pd.get("tools_called") or [],
    }


def _serialize(r: Rapport) -> dict:
    return {
        "id":               r.id,
        "titre":            r.titre,
        "type":             r.type,
        "format":           r.format,
        "statut":           r.statut,
        "progression":      r.progression,
        "sections":         r.sections or [],
        "periode_debut":    r.periode_debut.isoformat() if r.periode_debut else None,
        "periode_fin":      r.periode_fin.isoformat()   if r.periode_fin   else None,
        "date_creation":    r.date_creation.isoformat() if r.date_creation else None,
        "date_generation":  r.date_generation.isoformat() if r.date_generation else None,
        **_analysis_fields(r),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
def list_reports(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    rapports = (
        db.query(Rapport)
        .filter(Rapport.tenant_id == tenant_id)
        .order_by(Rapport.date_creation.desc())
        .all()
    )
    return [_serialize(r) for r in rapports]


@router.post("", status_code=201)
def create_report(
    body: ReportCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    from src.worker.tasks.report_generator import generate_report_task

    from datetime import date as date_type
    def _parse_date(s):
        if not s:
            return None
        try:
            return date_type.fromisoformat(s)
        except ValueError:
            return None

    rapport = Rapport(
        tenant_id       = current_user.tenant_id,
        id_utilisateur  = current_user.id,
        titre           = body.titre,
        type            = body.type,
        format          = body.format,
        statut          = "EN_ATTENTE",
        progression     = 0,
        sections        = body.sections,
        periode_debut   = _parse_date(body.periode_debut),
        periode_fin     = _parse_date(body.periode_fin),
        date_creation   = datetime.now(timezone.utc),
    )
    db.add(rapport)
    db.commit()
    db.refresh(rapport)

    generate_report_task.delay(rapport.id)

    return _serialize(rapport)


@router.get("/{rapport_id}/status")
def get_report_status(
    rapport_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    rapport = db.query(Rapport).filter(Rapport.id == rapport_id).first()
    if not rapport or rapport.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Rapport introuvable")
    return {
        "id":              rapport.id,
        "statut":          rapport.statut,
        "progression":     rapport.progression,
        "date_generation": rapport.date_generation.isoformat() if rapport.date_generation else None,
        **_analysis_fields(rapport),
    }


@router.get("/{rapport_id}/download")
def download_report(
    rapport_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    rapport = db.query(Rapport).filter(Rapport.id == rapport_id).first()
    if not rapport or rapport.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Rapport introuvable")
    if not rapport.file_path:
        raise HTTPException(status_code=404, detail="Fichier non disponible")
    if rapport.statut != "PRET":
        raise HTTPException(status_code=409, detail="Rapport pas encore prêt")
    if not rapport.file_path.startswith(REPORTS_DIR + "/"):
        raise HTTPException(status_code=500, detail="Chemin de rapport invalide")
    if not os.path.exists(rapport.file_path):
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")

    if rapport.format == "PDF":
        media_type   = "application/pdf"
        extension    = "pdf"
    else:
        media_type   = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        extension    = "xlsx"

    safe_titre = (rapport.titre or "rapport").replace(" ", "_")[:60]
    filename   = f"{safe_titre}.{extension}"

    return FileResponse(
        path=rapport.file_path,
        media_type=media_type,
        filename=filename,
    )


@router.post("/{rapport_id}/retry")
def retry_report(
    rapport_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    from src.worker.tasks.report_generator import generate_report_task

    rapport = db.query(Rapport).filter(Rapport.id == rapport_id).first()
    if not rapport or rapport.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Rapport introuvable")
    if rapport.statut != "ERREUR":
        raise HTTPException(status_code=409, detail="Seuls les rapports en erreur peuvent être relancés")

    rapport.statut      = "EN_ATTENTE"
    rapport.progression = 0
    rapport.file_path   = None
    db.commit()

    generate_report_task.delay(rapport.id)
    return _serialize(rapport)


@router.delete("/{rapport_id}", status_code=204)
def delete_report(
    rapport_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    rapport = db.query(Rapport).filter(Rapport.id == rapport_id).first()
    if not rapport or rapport.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Rapport introuvable")

    if rapport.file_path and os.path.exists(rapport.file_path):
        try:
            os.remove(rapport.file_path)
        except OSError:
            pass

    db.delete(rapport)
    db.commit()
    return Response(status_code=204)
