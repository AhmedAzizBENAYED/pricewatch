from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import PaginationMeta
from src.common.models import (
    Evenement, Notification, OffreNormalisee, Scrapper, SiteSource,
)

router = APIRouter(prefix="/alerts")

_ROLES = ("MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING")

_MESSAGES = {
    "BAISSE_PRIX":               "{site} a baissé un produit",
    "HAUSSE_PRIX":               "Hausse de prix détectée sur {site}",
    "DEBUT_PROMOTION":           "Promotion détectée sur {site}",
    "RUPTURE_STOCK":             "Rupture détectée sur {site}",
    "RETOUR_STOCK":              "Retour en stock sur {site}",
    "NOUVELLE_OFFRE_DECOUVERTE": "Nouveau produit sur {site}",
}


def _base_query(db, user_id):
    return (
        db.query(Notification, Evenement, OffreNormalisee, SiteSource)
        .join(Evenement, Evenement.id == Notification.evenement_id)
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .filter(Notification.id_utilisateur == user_id)
    )


def _delta_pct(avant, apres):
    if avant is None or apres is None or float(avant) == 0:
        return None
    return round((float(apres) - float(avant)) / float(avant) * 100, 1)


# ── /alerts/unread-count — must be before /alerts/{id} ───────────────────────

@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    count = (
        db.query(func.count(Notification.id))
        .filter(
            Notification.id_utilisateur == current_user.id,
            Notification.lu == False,
        )
        .scalar() or 0
    )
    return {"count": count}


# ── /alerts/read-all — must be before /alerts/{id} ───────────────────────────

@router.patch("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    updated = (
        db.query(Notification)
        .filter(
            Notification.id_utilisateur == current_user.id,
            Notification.lu == False,
        )
        .update({"lu": True}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}


# ── /alerts (paginated list) ──────────────────────────────────────────────────

@router.get("")
def list_alerts(
    lu: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    q = _base_query(db, current_user.id)

    if lu is not None:
        q = q.filter(Notification.lu == lu)

    total = q.with_entities(func.count(Notification.id)).scalar()

    rows = (
        q.order_by(Notification.date_creation.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    data = []
    for n, e, o, s in rows:
        template = _MESSAGES.get(e.type_evenement, "Événement sur {site}")
        data.append({
            "id":             n.id,
            "lu":             n.lu,
            "date_creation":  n.date_creation,
            "type_evenement": e.type_evenement,
            "offre_id":       o.id,
            "offre_nom":      o.nom,
            "image":          o.image,
            "site_name":      s.name,
            "site_slug":      s.scraper_id,
            "valeur_avant":   float(e.valeur_avant) if e.valeur_avant is not None else None,
            "valeur_apres":   float(e.valeur_apres) if e.valeur_apres is not None else None,
            "delta_pct":      _delta_pct(e.valeur_avant, e.valeur_apres),
            "message":        template.format(site=s.name),
        })

    return {
        "data": data,
        "meta": PaginationMeta(
            total=total, page=page, limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


# ── /alerts/{id}/read ─────────────────────────────────────────────────────────

@router.patch("/{alert_id}/read")
def mark_read(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    n = db.query(Notification).filter(Notification.id == alert_id).first()
    if not n or n.id_utilisateur != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.lu = True
    db.commit()
    return {"id": n.id, "lu": True}
