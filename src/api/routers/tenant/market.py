from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, cast, func
from sqlalchemy.types import Date
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_plan, require_role
from src.common.models import (
    Categorie, Evenement, OffreNormalisee,
    Scrapper, SiteSource, Tenant, TenantCategorie,
)

router = APIRouter(prefix="/market", dependencies=[Depends(require_plan('PREMIUM'))])

_ROLES = ("MANAGER", "RESP_MARKETING")


def _own_site_id(db: Session, tenant_id: int) -> int | None:
    """Return own_site_id for SITE_ECOMMERCE tenants, None otherwise."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant and tenant.profil_client == "SITE_ECOMMERCE" and tenant.own_site_id:
        return tenant.own_site_id
    return None


def _tenant_scope_offre_ids(db: Session, tenant_id: int, exclude_site_id: int | None = None):
    """Subquery returning offre ids within the tenant's category scope."""
    q = (
        db.query(OffreNormalisee.id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == tenant_id)
    )
    if exclude_site_id is not None:
        q = (
            q.join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
             .filter(Scrapper.site_source_id != exclude_site_id)
        )
    return q.subquery()


@router.get("/activity")
def get_market_activity(
    period: str = Query(default="30d", pattern="^(7d|30d)$"),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    days = 7 if period == "7d" else 30

    today = date.today()
    start = today - timedelta(days=days - 1)

    own_id   = _own_site_id(db, tenant_id)
    scope_sq = _tenant_scope_offre_ids(db, tenant_id, exclude_site_id=own_id)

    day_col = cast(Evenement.date_detection, Date)
    rows = (
        db.query(
            day_col.label("day"),
            Evenement.type_evenement,
            func.count(Evenement.id).label("cnt"),
        )
        .filter(
            Evenement.offre_id.in_(scope_sq),
            day_col >= start,
            Evenement.type_evenement.in_(
                ["HAUSSE_PRIX", "BAISSE_PRIX", "DEBUT_PROMOTION"]
            ),
        )
        .group_by(day_col, Evenement.type_evenement)
        .all()
    )

    hausses_map: dict[str, int] = {}
    baisses_map: dict[str, int] = {}
    promos_map:  dict[str, int] = {}

    for r in rows:
        d = str(r.day)
        if r.type_evenement == "HAUSSE_PRIX":
            hausses_map[d] = r.cnt
        elif r.type_evenement == "BAISSE_PRIX":
            baisses_map[d] = r.cnt
        elif r.type_evenement == "DEBUT_PROMOTION":
            promos_map[d] = r.cnt

    dates_list = [str(start + timedelta(days=i)) for i in range(days)]
    hausses = [hausses_map.get(d, 0) for d in dates_list]
    baisses = [baisses_map.get(d, 0) for d in dates_list]
    promos  = [promos_map.get(d, 0) for d in dates_list]

    return {
        "dates":   dates_list,
        "hausses": hausses,
        "baisses": baisses,
        "promos":  promos,
        "total":   sum(hausses) + sum(baisses) + sum(promos),
    }


@router.get("/heatmap")
def get_market_heatmap(
    limit: int = Query(10, ge=3, le=30),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    cutoff    = datetime.now(timezone.utc) - timedelta(days=30)
    own_id    = _own_site_id(db, tenant_id)

    filters = [
        TenantCategorie.tenant_id == tenant_id,
        Evenement.date_detection >= cutoff,
    ]
    if own_id is not None:
        filters.append(Scrapper.site_source_id != own_id)

    rows = (
        db.query(
            Categorie.nom.label("cat_nom"),
            SiteSource.name.label("site_name"),
            SiteSource.scraper_id.label("site_slug"),
            func.count(Evenement.id).label("nb"),
        )
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .filter(*filters)
        .group_by(Categorie.nom, SiteSource.name, SiteSource.scraper_id)
        .order_by(Categorie.nom, SiteSource.name)
        .all()
    )

    if not rows:
        return {"categories": [], "sites": [], "data": []}

    # Keep only the top N most active categories (by total event count)
    cat_totals: dict[str, int] = {}
    for r in rows:
        cat_totals[r.cat_nom] = cat_totals.get(r.cat_nom, 0) + int(r.nb)
    top_cats = sorted(cat_totals, key=lambda c: cat_totals[c], reverse=True)[:limit]
    top_cats_set = set(top_cats)
    rows = [r for r in rows if r.cat_nom in top_cats_set]

    if not rows:
        return {"categories": [], "sites": [], "data": []}

    # Categories ordered by activity desc, sites alphabetical
    cats_ordered  = [c for c in top_cats]
    sites_ordered = list(dict.fromkeys((r.site_name, r.site_slug) for r in rows))

    cat_idx  = {c: i for i, c in enumerate(cats_ordered)}
    site_idx = {p: i for i, p in enumerate(sites_ordered)}

    count_matrix = [[0] * len(sites_ordered) for _ in cats_ordered]
    for r in rows:
        count_matrix[cat_idx[r.cat_nom]][site_idx[(r.site_name, r.site_slug)]] = int(r.nb)

    max_val = max(max(row) for row in count_matrix)
    if max_val > 0:
        data = [[int(v / max_val * 100) for v in row] for row in count_matrix]
    else:
        data = count_matrix

    return {
        "categories": cats_ordered,
        "sites":      [{"name": name, "slug": slug} for name, slug in sites_ordered],
        "data":       data,
    }


@router.get("/trends")
def get_market_trends(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    cutoff    = datetime.now(timezone.utc) - timedelta(days=30)
    own_id    = _own_site_id(db, tenant_id)

    scope_sq = _tenant_scope_offre_ids(db, tenant_id, exclude_site_id=own_id)

    # Most active categories (competitor activity only)
    top_cats = (
        db.query(
            Categorie.nom.label("nom"),
            func.count(Evenement.id).label("nb_evenements"),
        )
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .filter(
            Evenement.offre_id.in_(scope_sq),
            Evenement.date_detection >= cutoff,
        )
        .group_by(Categorie.nom)
        .order_by(func.count(Evenement.id).desc())
        .limit(3)
        .all()
    )

    # Most aggressive competitor sites (by baisses count)
    _baisses_expr = func.count(
        case((Evenement.type_evenement == "BAISSE_PRIX", 1), else_=None)
    )
    _promos_expr = func.count(
        case((Evenement.type_evenement == "DEBUT_PROMOTION", 1), else_=None)
    )

    comp_filters = [
        TenantCategorie.tenant_id == tenant_id,
        Evenement.date_detection >= cutoff,
    ]
    if own_id is not None:
        comp_filters.append(Scrapper.site_source_id != own_id)

    top_comp = (
        db.query(
            SiteSource.name.label("site_name"),
            SiteSource.scraper_id.label("site_slug"),
            _baisses_expr.label("nb_baisses"),
            _promos_expr.label("nb_promos"),
        )
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .filter(*comp_filters)
        .group_by(SiteSource.name, SiteSource.scraper_id)
        .order_by(_baisses_expr.desc())
        .limit(3)
        .all()
    )

    # Most volatile offers (competitor offers only)
    top_vol = (
        db.query(
            func.min(OffreNormalisee.nom).label("nom_produit"),
            func.count(Evenement.id).label("nb_changements"),
        )
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .filter(
            Evenement.offre_id.in_(scope_sq),
            Evenement.date_detection >= cutoff,
        )
        .group_by(OffreNormalisee.id)
        .order_by(func.count(Evenement.id).desc())
        .limit(3)
        .all()
    )

    return {
        "top_categories": [
            {"nom": r.nom, "nb_evenements": r.nb_evenements}
            for r in top_cats
        ],
        "top_competitors": [
            {
                "site_name":  r.site_name,
                "site_slug":  r.site_slug,
                "nb_baisses": r.nb_baisses,
                "nb_promos":  r.nb_promos,
            }
            for r in top_comp
        ],
        "top_volatils": [
            {"nom_produit": r.nom_produit, "nb_changements": r.nb_changements}
            for r in top_vol
        ],
    }
