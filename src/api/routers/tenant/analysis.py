from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_plan, require_role
from src.common.models import (
    Categorie, OffreNormalisee,
    Scrapper, SiteSource, Snapshot, Tenant, TenantCategorie,
)

router = APIRouter(prefix="/analysis", dependencies=[Depends(require_plan('MEDIUM'))])

_ROLES = ("MANAGER", "RESP_MARKETING")


def _tenant_scope_produit_ids(db: Session, tenant_id: int):
    """Return a subquery of produit_id values in the tenant's category scope."""
    return (
        db.query(OffreNormalisee.produit_id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(
            TenantCategorie.tenant_id == tenant_id,
            OffreNormalisee.produit_id.isnot(None),
        )
        .distinct()
        .subquery()
    )


def _current_price_subq(db: Session):
    """Subquery: latest active snapshot price per offre."""
    return (
        db.query(
            Snapshot.offre_id,
            Snapshot.prix_original,
        )
        .filter(Snapshot.date_fin_observation.is_(None))
        .subquery()
    )


def _classify(own_p: float, avg_p: float) -> str:
    if own_p <= avg_p * 0.95:
        return "moins_cher"
    if own_p >= avg_p * 1.05:
        return "plus_cher"
    return "dans_moyenne"


def _product_positioning_rows(
    db: Session,
    tenant_id: int,
    profil: str,
    own_site_id: int | None,
    own_brand: str | None,
) -> list[dict]:
    """Per-product positioning list shared by /positioning and /positioning/categories."""
    scope_sq = _tenant_scope_produit_ids(db, tenant_id)
    snap_sq  = _current_price_subq(db)
    produits = []

    if profil == "SITE_ECOMMERCE" and own_site_id:
        rows = (
            db.query(
                OffreNormalisee.produit_id,
                func.min(OffreNormalisee.nom).label("nom_produit"),
                func.min(Categorie.nom).label("categorie_nom"),
                func.min(OffreNormalisee.image).label("image"),
                func.min(
                    case(
                        (Scrapper.site_source_id == own_site_id, snap_sq.c.prix_original),
                        else_=None,
                    )
                ).label("own_price"),
                func.avg(
                    case(
                        (Scrapper.site_source_id != own_site_id, snap_sq.c.prix_original),
                        else_=None,
                    )
                ).label("market_avg"),
                func.min(
                    case(
                        (Scrapper.site_source_id != own_site_id, snap_sq.c.prix_original),
                        else_=None,
                    )
                ).label("market_min"),
            )
            .join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
            .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
            .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
            .filter(OffreNormalisee.produit_id.in_(scope_sq))
            .group_by(OffreNormalisee.produit_id)
            .all()
        )
        for r in rows:
            if r.own_price is None or r.market_avg is None:
                continue
            own_p = float(r.own_price)
            avg_p = float(r.market_avg)
            produits.append({
                "produit_id":    r.produit_id,
                "nom_produit":   r.nom_produit,
                "categorie_nom": r.categorie_nom,
                "image":         r.image,
                "own_price":     round(own_p, 3),
                "market_avg":    round(avg_p, 3),
                "market_min":    round(float(r.market_min), 3) if r.market_min is not None else None,
                "position":      _classify(own_p, avg_p),
            })

    elif profil == "MARQUE" and own_brand:
        rows = (
            db.query(
                OffreNormalisee.produit_id,
                func.min(OffreNormalisee.nom).label("nom_produit"),
                func.min(Categorie.nom).label("categorie_nom"),
                func.min(OffreNormalisee.image).label("image"),
                func.min(
                    case(
                        (func.lower(OffreNormalisee.marque) == own_brand.lower(), snap_sq.c.prix_original),
                        else_=None,
                    )
                ).label("own_price"),
                func.avg(
                    case(
                        (func.lower(OffreNormalisee.marque) != own_brand.lower(), snap_sq.c.prix_original),
                        else_=None,
                    )
                ).label("market_avg"),
                func.min(
                    case(
                        (func.lower(OffreNormalisee.marque) != own_brand.lower(), snap_sq.c.prix_original),
                        else_=None,
                    )
                ).label("market_min"),
            )
            .join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
            .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
            .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
            .filter(
                OffreNormalisee.produit_id.in_(scope_sq),
                OffreNormalisee.marque.isnot(None),
            )
            .group_by(OffreNormalisee.produit_id)
            .all()
        )
        for r in rows:
            if r.own_price is None or r.market_avg is None:
                continue
            own_p = float(r.own_price)
            avg_p = float(r.market_avg)
            produits.append({
                "produit_id":    r.produit_id,
                "nom_produit":   r.nom_produit,
                "categorie_nom": r.categorie_nom,
                "image":         r.image,
                "own_price":     round(own_p, 3),
                "market_avg":    round(avg_p, 3),
                "market_min":    round(float(r.market_min), 3) if r.market_min is not None else None,
                "position":      _classify(own_p, avg_p),
            })

    return produits


def _cheapest_by_product(
    db: Session,
    tenant_id: int,
    own_site_id: int,
) -> dict:
    """Return {produit_id: {site_name, site_slug, price}} for the cheapest competitor site."""
    cheapest_site_sq = (
        db.query(
            OffreNormalisee.produit_id,
            SiteSource.name.label("site_name"),
            SiteSource.scraper_id.label("site_slug"),
            func.min(Snapshot.prix_original).label("min_price"),
        )
        .join(Snapshot, and_(
            Snapshot.offre_id == OffreNormalisee.id,
            Snapshot.date_fin_observation.is_(None),
        ))
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(
            TenantCategorie.tenant_id == tenant_id,
            OffreNormalisee.produit_id.isnot(None),
            Scrapper.site_source_id != own_site_id,
        )
        .group_by(
            OffreNormalisee.produit_id,
            SiteSource.name,
            SiteSource.scraper_id,
        )
        .subquery()
    )

    rows = db.query(cheapest_site_sq).all()
    cheapest: dict = {}
    for r in rows:
        pid = r.produit_id
        if r.min_price is None:
            continue
        price = float(r.min_price)
        if pid not in cheapest or price < cheapest[pid]["price"]:
            cheapest[pid] = {
                "site_name": r.site_name,
                "site_slug": r.site_slug,
                "price":     price,
            }
    return cheapest


def _build_product_history(
    db: Session,
    tenant_id: int,
    own_site_id: int,
    produit_ids: list[int],
) -> dict:
    """
    Return {produit_id: [score, ...]} where score ∈ {1, 0, -1, None}
    for the last 30 days (oldest first, up to 30 entries).
    """
    if not produit_ids:
        return {}

    since = datetime.now(timezone.utc) - timedelta(days=30)

    rows = (
        db.query(
            OffreNormalisee.produit_id,
            func.date_trunc("day", Snapshot.date_debut_observation).label("day"),
            case(
                (Scrapper.site_source_id == own_site_id, Snapshot.prix_original),
                else_=None,
            ).label("own_price"),
            case(
                (Scrapper.site_source_id != own_site_id, Snapshot.prix_original),
                else_=None,
            ).label("comp_price"),
        )
        .join(Snapshot, Snapshot.offre_id == OffreNormalisee.id)
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(
            TenantCategorie.tenant_id == tenant_id,
            OffreNormalisee.produit_id.in_(produit_ids),
            Snapshot.date_debut_observation >= since,
        )
        .all()
    )

    daily: dict = defaultdict(lambda: defaultdict(lambda: {"own": [], "comp": []}))
    for r in rows:
        day_str = r.day.strftime("%Y-%m-%d")
        if r.own_price is not None:
            daily[r.produit_id][day_str]["own"].append(float(r.own_price))
        if r.comp_price is not None:
            daily[r.produit_id][day_str]["comp"].append(float(r.comp_price))

    def _score(own_avg: float, comp_avg: float) -> int:
        if own_avg <= comp_avg * 0.95:
            return 1
        if own_avg >= comp_avg * 1.05:
            return -1
        return 0

    result: dict = {}
    for pid, days in daily.items():
        scores = []
        for day_str in sorted(days.keys())[-30:]:
            d = days[day_str]
            if d["own"] and d["comp"]:
                own_avg  = sum(d["own"])  / len(d["own"])
                comp_avg = sum(d["comp"]) / len(d["comp"])
                scores.append(_score(own_avg, comp_avg))
            else:
                scores.append(None)
        result[pid] = scores
    return result


@router.get("/positioning")
def get_positioning(
    include_history: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    profil      = tenant.profil_client if tenant else None
    own_site_id = tenant.own_site_id   if tenant else None
    own_brand   = tenant.own_brand     if tenant else None

    if not own_site_id and not own_brand:
        return {"profil": profil, "error": "own_site_id ou own_brand non configuré"}

    produits = _product_positioning_rows(db, tenant_id, profil, own_site_id, own_brand)

    # ── Enrich with cheapest competitor site (SITE_ECOMMERCE only) ──
    cheapest: dict = {}
    if profil == "SITE_ECOMMERCE" and own_site_id:
        cheapest = _cheapest_by_product(db, tenant_id, own_site_id)

    # ── Enrich with 30-day history (SITE_ECOMMERCE only) ──
    product_history: dict = {}
    if include_history and profil == "SITE_ECOMMERCE" and own_site_id:
        pids = [p["produit_id"] for p in produits]
        product_history = _build_product_history(db, tenant_id, own_site_id, pids)

    # ── Attach enrichments to each product ──
    enriched = []
    for p in produits:
        pid = p["produit_id"]
        c = cheapest.get(pid, {})
        p["cheapest_site_name"] = c.get("site_name")
        p["cheapest_site_slug"] = c.get("site_slug")
        p["history"] = product_history.get(pid, [])
        enriched.append(p)

    total        = len(enriched)
    moins_cher   = sum(1 for p in enriched if p["position"] == "moins_cher")
    dans_moyenne = sum(1 for p in enriched if p["position"] == "dans_moyenne")
    plus_cher    = sum(1 for p in enriched if p["position"] == "plus_cher")

    def pct(n):
        return round(n / total * 100, 1) if total else 0.0

    return {
        "profil":           profil,
        "total_produits":   total,
        "moins_cher":       moins_cher,
        "dans_moyenne":     dans_moyenne,
        "plus_cher":        plus_cher,
        "pct_moins_cher":   pct(moins_cher),
        "pct_dans_moyenne": pct(dans_moyenne),
        "pct_plus_cher":    pct(plus_cher),
        "produits":         enriched[:100],
    }


@router.get("/positioning/categories")
def get_positioning_categories(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    profil      = tenant.profil_client if tenant else None
    own_site_id = tenant.own_site_id   if tenant else None
    own_brand   = tenant.own_brand     if tenant else None

    if not own_site_id and not own_brand:
        return []

    produits = _product_positioning_rows(db, tenant_id, profil, own_site_id, own_brand)

    cat_map: dict[str, dict] = defaultdict(
        lambda: {"moins_cher": 0, "dans_moyenne": 0, "plus_cher": 0}
    )
    for p in produits:
        cat_map[p["categorie_nom"]][p["position"]] += 1

    result = []
    for cat_nom, counts in cat_map.items():
        total = counts["moins_cher"] + counts["dans_moyenne"] + counts["plus_cher"]

        def pct(n, t=total):
            return round(n / t * 100, 1) if t else 0.0

        result.append({
            "categorie_nom":    cat_nom,
            "total":            total,
            "moins_cher":       counts["moins_cher"],
            "dans_moyenne":     counts["dans_moyenne"],
            "plus_cher":        counts["plus_cher"],
            "pct_moins_cher":   pct(counts["moins_cher"]),
            "pct_dans_moyenne": pct(counts["dans_moyenne"]),
            "pct_plus_cher":    pct(counts["plus_cher"]),
        })

    return sorted(result, key=lambda x: x["total"], reverse=True)


@router.get("/risk-categories")
def get_risk_categories(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    profil      = tenant.profil_client if tenant else None
    own_site_id = tenant.own_site_id   if tenant else None
    own_brand   = tenant.own_brand     if tenant else None

    if not own_site_id and not own_brand:
        return []

    produits = _product_positioning_rows(db, tenant_id, profil, own_site_id, own_brand)

    cat_map: dict[str, dict] = defaultdict(
        lambda: {"plus_cher": 0, "total": 0}
    )
    for p in produits:
        cat_map[p["categorie_nom"]]["total"] += 1
        if p["position"] == "plus_cher":
            cat_map[p["categorie_nom"]]["plus_cher"] += 1

    result = []
    for cat_nom, counts in cat_map.items():
        total = counts["total"]
        plus_cher = counts["plus_cher"]
        pct = round(plus_cher / total * 100, 1) if total else 0.0
        if pct > 25:
            result.append({
                "categorie_nom": cat_nom,
                "pct_plus_cher": pct,
                "nb_produits":   total,
            })

    return sorted(result, key=lambda x: x["pct_plus_cher"], reverse=True)[:3]


@router.get("/positioning/competitors")
def get_positioning_competitors(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    profil      = tenant.profil_client if tenant else None
    own_site_id = tenant.own_site_id   if tenant else None

    if profil == "MARQUE" or not own_site_id:
        return []

    scope_sq = _tenant_scope_produit_ids(db, tenant_id)
    snap_sq  = _current_price_subq(db)

    total_produits = db.query(func.count()).select_from(scope_sq).scalar() or 1

    # Min own-site price per product
    own_prices_sq = (
        db.query(
            OffreNormalisee.produit_id,
            func.min(snap_sq.c.prix_original).label("own_price"),
        )
        .join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .filter(
            OffreNormalisee.produit_id.in_(scope_sq),
            Scrapper.site_source_id == own_site_id,
        )
        .group_by(OffreNormalisee.produit_id)
        .subquery()
    )

    # Min competitor price per (site, product)
    comp_prices_sq = (
        db.query(
            Scrapper.site_source_id,
            OffreNormalisee.produit_id,
            func.min(snap_sq.c.prix_original).label("comp_price"),
        )
        .join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .filter(
            OffreNormalisee.produit_id.in_(scope_sq),
            Scrapper.site_source_id != own_site_id,
        )
        .group_by(Scrapper.site_source_id, OffreNormalisee.produit_id)
        .subquery()
    )

    # Count products where competitor is cheaper
    cheaper_rows = (
        db.query(
            comp_prices_sq.c.site_source_id,
            func.count(comp_prices_sq.c.produit_id).label("nb_moins_chers"),
        )
        .join(
            own_prices_sq,
            and_(
                own_prices_sq.c.produit_id == comp_prices_sq.c.produit_id,
                comp_prices_sq.c.comp_price < own_prices_sq.c.own_price,
            ),
        )
        .group_by(comp_prices_sq.c.site_source_id)
        .all()
    )

    # Active promotions per competitor site (offer-level, in scope)
    promos_rows = (
        db.query(
            Scrapper.site_source_id,
            func.count(OffreNormalisee.id).label("nb_promos"),
        )
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .filter(
            OffreNormalisee.produit_id.in_(scope_sq),
            OffreNormalisee.est_en_promotion == True,
            Scrapper.site_source_id != own_site_id,
        )
        .group_by(Scrapper.site_source_id)
        .all()
    )

    cheaper_map = {r.site_source_id: r.nb_moins_chers for r in cheaper_rows}
    promos_map  = {r.site_source_id: r.nb_promos        for r in promos_rows}

    sites = db.query(SiteSource).filter(SiteSource.id != own_site_id).all()

    result = []
    for site in sites:
        nb = cheaper_map.get(site.id, 0)
        intensite = min(round(nb / total_produits * 10), 10)
        result.append({
            "site_name":         site.name,
            "site_slug":         site.scraper_id,
            "nb_moins_chers":    nb,
            "nb_promos_actives": promos_map.get(site.id, 0),
            "intensite":         intensite,
        })

    return sorted(result, key=lambda x: x["nb_moins_chers"], reverse=True)
