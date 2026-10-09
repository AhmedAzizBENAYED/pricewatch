from datetime import datetime, timedelta, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import PaginationMeta
from src.common.models import (
    Categorie, Evenement, OffreNormalisee,
    Scrapper, SiteSource, Tenant, TenantCategorie,
)

router = APIRouter(prefix="/events")

_ROLES = ("MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING")

_ALL_TYPES = (
    "BAISSE_PRIX",
    "HAUSSE_PRIX",
    "DEBUT_PROMOTION",
    "RUPTURE_STOCK",
    "RETOUR_STOCK",
    "NOUVELLE_OFFRE_DECOUVERTE",
)


def _own_site_id(db: Session, tenant_id: int) -> int | None:
    """Return own_site_id for SITE_ECOMMERCE tenants, None otherwise."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant and tenant.profil_client == "SITE_ECOMMERCE" and tenant.own_site_id:
        return tenant.own_site_id
    return None


def _delta(avant, apres):
    if avant is None or apres is None:
        return None, None
    avant_f = float(avant)
    apres_f = float(apres)
    delta_abs = round(apres_f - avant_f, 3)
    delta_pct = round((apres_f - avant_f) / avant_f * 100, 1) if avant_f != 0 else None
    return delta_abs, delta_pct


def _base_query(db, tenant_id, exclude_site_id: int | None = None):
    q = (
        db.query(Evenement, OffreNormalisee, SiteSource, Categorie)
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .join(Scrapper, OffreNormalisee.scraper_id == Scrapper.id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == tenant_id)
    )
    if exclude_site_id is not None:
        q = q.filter(Scrapper.site_source_id != exclude_site_id)
    return q


# ── /events/summary must be declared BEFORE /events/{id} ─────────────────────

@router.get("/summary")
def get_events_summary(
    period: str = Query("7d", pattern="^(7d|30d)$"),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    days = 7 if period == "7d" else 30
    since = datetime.now(timezone.utc) - timedelta(days=days)

    own_id = _own_site_id(db, tenant_id)

    rows = (
        _base_query(db, tenant_id, exclude_site_id=own_id)
        .filter(Evenement.date_detection >= since)
        .with_entities(
            Evenement.type_evenement,
            func.count(Evenement.id).label("cnt"),
        )
        .group_by(Evenement.type_evenement)
        .all()
    )

    by_type = {t: 0 for t in _ALL_TYPES}
    for type_evenement, cnt in rows:
        if type_evenement in by_type:
            by_type[type_evenement] = cnt

    return {"by_type": by_type, "total": sum(by_type.values())}


# ── /events/sites — distinct competitor sites within the tenant's scope ───────

@router.get("/sites")
def get_event_sites(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    own_id    = _own_site_id(db, tenant_id)

    q = (
        db.query(SiteSource.scraper_id, SiteSource.name)
        .join(Scrapper, Scrapper.site_source_id == SiteSource.id)
        .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == tenant_id)
    )
    if own_id is not None:
        q = q.filter(Scrapper.site_source_id != own_id)

    rows = q.distinct().order_by(SiteSource.name.asc()).all()
    return [{"slug": slug, "name": name} for slug, name in rows]


# ── /events (paginated list) ──────────────────────────────────────────────────

@router.get("")
def list_events(
    type_evenement: list[str] | None = Query(None),
    site_id: int | None = Query(None),
    site_slug: list[str] | None = Query(None),
    categorie_q: str | None = Query(None),
    referentiel_id: int | None = Query(None),
    offre_id: int | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    own_id    = _own_site_id(db, tenant_id)

    q = _base_query(db, tenant_id, exclude_site_id=own_id)

    if type_evenement:
        q = q.filter(Evenement.type_evenement.in_(type_evenement))
    if site_id:
        q = q.filter(SiteSource.id == site_id)
    if site_slug:
        q = q.filter(SiteSource.scraper_id.in_(site_slug))
    if categorie_q:
        q = q.filter(Categorie.nom.ilike(f"%{categorie_q}%"))
    if referentiel_id:
        q = q.filter(OffreNormalisee.produit_id == referentiel_id)
    if offre_id:
        q = q.filter(Evenement.offre_id == offre_id)
    if date_from:
        try:
            q = q.filter(Evenement.date_detection >= datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"date_from invalide: {date_from!r}")
    if date_to:
        try:
            q = q.filter(Evenement.date_detection <= datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"date_to invalide: {date_to!r}")

    total = q.with_entities(func.count(Evenement.id)).scalar()

    rows = (
        q.order_by(Evenement.date_detection.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    data = []
    for e, o, s, c in rows:
        delta_abs, delta_pct = _delta(e.valeur_avant, e.valeur_apres)
        data.append({
            "id":             e.id,
            "type_evenement": e.type_evenement,
            "date_detection": e.date_detection,
            "offre_id":       o.id,
            "offre_nom":      o.nom,
            "referentiel_id": o.produit_id,
            "site_name":      s.name,
            "site_slug":      s.scraper_id,
            "valeur_avant":   float(e.valeur_avant) if e.valeur_avant is not None else None,
            "valeur_apres":   float(e.valeur_apres) if e.valeur_apres is not None else None,
            "delta_absolu":   delta_abs,
            "delta_pct":      delta_pct,
            "categorie_nom":  c.nom,
        })

    return {
        "data": data,
        "meta": PaginationMeta(
            total=total, page=page, limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }
