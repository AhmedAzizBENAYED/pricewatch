import uuid
from datetime import datetime
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import AuditDetail, AuditListItem, PaginationMeta
from src.common.models import JournalAudit, Utilisateur

router = APIRouter(prefix="/audit")


@router.get("")
def list_audit(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    action: str | None = Query(None),
    tenant_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    count_q = db.query(func.count(JournalAudit.id))
    rows_q = (
        db.query(JournalAudit, Utilisateur.nom.label("utilisateur_nom"))
        .outerjoin(Utilisateur, Utilisateur.id == JournalAudit.id_utilisateur)
    )

    if tenant_id is not None:
        count_q = count_q.join(Utilisateur, Utilisateur.id == JournalAudit.id_utilisateur).filter(Utilisateur.tenant_id == tenant_id)
        rows_q  = rows_q.filter(Utilisateur.tenant_id == tenant_id)
    if date_from:
        count_q = count_q.filter(JournalAudit.horodatage >= date_from)
        rows_q  = rows_q.filter(JournalAudit.horodatage >= date_from)
    if date_to:
        count_q = count_q.filter(JournalAudit.horodatage <= date_to)
        rows_q  = rows_q.filter(JournalAudit.horodatage <= date_to)
    if action:
        count_q = count_q.filter(JournalAudit.action == action)
        rows_q  = rows_q.filter(JournalAudit.action == action)

    total = count_q.scalar()
    rows = (
        rows_q.order_by(JournalAudit.horodatage.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    data = [
        AuditListItem(
            id=str(entry.id),
            action=entry.action,
            id_utilisateur=entry.id_utilisateur,
            utilisateur_nom=utilisateur_nom,
            horodatage=entry.horodatage,
        ).model_dump()
        for entry, utilisateur_nom in rows
    ]

    return {
        "data": data,
        "meta": PaginationMeta(
            total=total, page=page, limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


@router.get("/{entry_id}")
def get_audit_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    try:
        uid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Audit entry not found")

    row = (
        db.query(JournalAudit, Utilisateur.nom.label("utilisateur_nom"))
        .outerjoin(Utilisateur, Utilisateur.id == JournalAudit.id_utilisateur)
        .filter(JournalAudit.id == uid)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Audit entry not found")

    entry, utilisateur_nom = row
    return AuditDetail(
        id=str(entry.id),
        action=entry.action,
        id_utilisateur=entry.id_utilisateur,
        utilisateur_nom=utilisateur_nom,
        valeurs_avant=entry.valeurs_avant,
        valeurs_apres=entry.valeurs_apres,
        horodatage=entry.horodatage,
    )