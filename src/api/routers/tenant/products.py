from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.dialects.postgresql import array_agg
from sqlalchemy.orm import Session

from src.api.deps import get_db, get_current_user, require_role, tenant_offers_query
from src.api.schemas.tenant_products import (
    ComparisonSite, OffreParSite, PriceSeries,
    ProductComparison, ProductHistory, ProduitDetail,
    ReferentielInfo,
)
from src.common.models import (
    Categorie, OffreNormalisee, Referentiel,
    Scrapper, Snapshot, SiteSource, Tenant, TenantCategorie,
)

router = APIRouter(prefix="/products")

_ROLES = ("MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING")


def _check_scope(db: Session, tenant_id: int, produit_id: int) -> Referentiel:
    if not tenant_offers_query(db, tenant_id).filter(OffreNormalisee.produit_id == produit_id).first():
        raise HTTPException(status_code=404, detail="Product not found")
    ref = db.query(Referentiel).filter(Referentiel.id == produit_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Product not found")
    return ref


def _offers_with_snapshot(db: Session, tenant_id: int, produit_id: int):
    """Returns rows of (OffreNormalisee, site_name, site_slug, snap_prix, snap_prix_promo, snap_stock, snap_date)."""
    return (
        tenant_offers_query(db, tenant_id)
        .filter(OffreNormalisee.produit_id == produit_id)
        .add_columns(
            SiteSource.name.label("site_name"),
            SiteSource.scraper_id.label("site_slug"),
            Snapshot.prix_original.label("snap_prix"),
            Snapshot.prix_en_promotion.label("snap_prix_promo"),
            Snapshot.stock_status.label("snap_stock"),
            Snapshot.date_debut_observation.label("snap_date"),
        )
        .outerjoin(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .outerjoin(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .outerjoin(Snapshot, and_(
            Snapshot.offre_id == OffreNormalisee.id,
            Snapshot.date_fin_observation.is_(None),
        ))
        .all()
    )


def _price_stats(prices: list[float]) -> tuple[float | None, float | None, float | None]:
    if not prices:
        return None, None, None
    return min(prices), max(prices), sum(prices) / len(prices)


# ── /products/categories — must be before /{produit_id} ──────────────────────

@router.get("/categories")
def get_tenant_categories(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (
        db.query(
            Categorie.id,
            Categorie.nom,
            Categorie.id_parent,
            func.count(func.distinct(OffreNormalisee.produit_id)).label("nb_produits"),
        )
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .outerjoin(OffreNormalisee, and_(
            OffreNormalisee.categorie_id == Categorie.id,
            OffreNormalisee.produit_id.isnot(None),
        ))
        .filter(TenantCategorie.tenant_id == current_user.tenant_id)
        .group_by(Categorie.id, Categorie.nom, Categorie.id_parent)
        .order_by(func.count(func.distinct(OffreNormalisee.produit_id)).desc())
        .all()
    )
    return [
        {"id": r.id, "nom": r.nom, "id_parent": r.id_parent, "nb_produits": r.nb_produits}
        for r in rows
    ]


# ── /products/brands — must be before /{produit_id} ──────────────────────────

@router.get("/brands")
def get_tenant_brands(
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tenant_id = current_user.tenant_id
    query = (
        db.query(
            Referentiel.marque,
            func.count(func.distinct(Referentiel.id)).label("nb_produits"),
        )
        .join(OffreNormalisee, OffreNormalisee.produit_id == Referentiel.id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(
            TenantCategorie.tenant_id == tenant_id,
            Referentiel.marque.isnot(None),
            Referentiel.marque != "",
        )
        .group_by(Referentiel.marque)
        .order_by(func.count(func.distinct(Referentiel.id)).desc())
    )
    if q:
        query = query.filter(Referentiel.marque.ilike(f"%{q}%"))
    rows = query.limit(50).all()
    return [{"marque": r.marque, "nb_produits": r.nb_produits} for r in rows]


# ── 1. List products ──────────────────────────────────────────────────────────

@router.get("")
def list_products(
    q: str | None = Query(None),
    categorie_id: int | None = Query(None),
    marques: list[str] = Query(default=[], alias="marque"),
    sort: str | None = Query(None),
    min_sites: int | None = Query(None, ge=1),
    en_promo: bool | None = Query(None),
    prix_min_filter: float | None = Query(None, alias="prix_min"),
    prix_max_filter: float | None = Query(None, alias="prix_max"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id

    # Step 1 — aggregated subquery: one row per produit_id with all computed fields
    agg = (
        db.query(
            OffreNormalisee.produit_id,
            func.min(Snapshot.prix_original).label("prix_min"),
            func.max(Snapshot.prix_original).label("prix_max"),
            func.avg(Snapshot.prix_original).label("prix_moyen"),
            func.count(func.distinct(SiteSource.id)).label("nb_sites"),
            func.bool_or(OffreNormalisee.est_en_promotion).label("has_promo"),
            array_agg(func.distinct(SiteSource.scraper_id)).label("site_slugs"),
            func.max(Snapshot.date_debut_observation).label("derniere_observation"),
        )
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .join(Snapshot, and_(
            Snapshot.offre_id == OffreNormalisee.id,
            Snapshot.date_fin_observation.is_(None),
        ))
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .filter(
            TenantCategorie.tenant_id == tenant_id,
            OffreNormalisee.produit_id.isnot(None),
            OffreNormalisee.categorie_id.isnot(None),
        )
        .group_by(OffreNormalisee.produit_id)
        .subquery()
    )

    # Step 2 — join aggregates to Referentiel + Categorie (outer: Referentiel.categorie_id may be NULL)
    base = (
        db.query(Referentiel, Categorie, agg)
        .join(agg, agg.c.produit_id == Referentiel.id)
        .outerjoin(Categorie, Categorie.id == Referentiel.categorie_id)
    )

    # Step 3 — apply filters
    if q:
        base = base.filter(or_(
            Referentiel.nom_produit.ilike(f"%{q}%"),
            Referentiel.marque.ilike(f"%{q}%"),
        ))
    if marques:
        base = base.filter(
            func.lower(Referentiel.marque).in_([m.lower() for m in marques])
        )
    if categorie_id:
        # Filter to products that have at least one offer in the specified category,
        # using OffreNormalisee.categorie_id (consistent with TenantCategorie scoping).
        base = base.filter(
            Referentiel.id.in_(
                db.query(OffreNormalisee.produit_id)
                .filter(
                    OffreNormalisee.categorie_id == categorie_id,
                    OffreNormalisee.produit_id.isnot(None),
                )
            )
        )
    if en_promo:
        base = base.filter(agg.c.has_promo == True)
    if min_sites:
        base = base.filter(agg.c.nb_sites >= min_sites)
    if prix_min_filter is not None:
        base = base.filter(agg.c.prix_max >= prix_min_filter)
    if prix_max_filter is not None:
        base = base.filter(agg.c.prix_min <= prix_max_filter)

    # Step 4 — sort
    sort_map = {
        "prix_asc":    agg.c.prix_min.asc().nullslast(),
        "ecart_desc":  (agg.c.prix_max - agg.c.prix_min).desc().nullslast(),
        "recent":      agg.c.derniere_observation.desc().nullslast(),
    }
    base = base.order_by(sort_map.get(sort or "", Referentiel.nom_produit.asc()))

    # Step 5 — paginate (strip ORDER BY for the COUNT — PostgreSQL rejects ORDER BY on aggregate-only SELECT)
    total = base.order_by(None).with_entities(func.count(Referentiel.id)).scalar()
    rows  = base.offset((page - 1) * limit).limit(limit).all()

    data = [
        {
            "id":                   r.Referentiel.id,
            "nom_produit":          r.Referentiel.nom_produit,
            "marque":               r.Referentiel.marque,
            "image":                r.Referentiel.image,
            "categorie_nom":        r.Categorie.nom if r.Categorie else None,
            "nb_sites":             r.nb_sites or 0,
            "prix_min":             float(r.prix_min) if r.prix_min is not None else None,
            "prix_max":             float(r.prix_max) if r.prix_max is not None else None,
            "prix_moyen":           float(r.prix_moyen) if r.prix_moyen is not None else None,
            "has_promo":            bool(r.has_promo),
            "site_slugs":           r.site_slugs or [],
            "derniere_observation": r.derniere_observation,
        }
        for r in rows
    ]

    return {
        "data": data,
        "meta": {
            "total": total,
            "page":  page,
            "limit": limit,
            "pages": (total + limit - 1) // limit if total else 0,
        },
    }


# ── 2. Product detail ─────────────────────────────────────────────────────────

@router.get("/{produit_id}")
def get_product(
    produit_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    ref = _check_scope(db, tenant_id, produit_id)

    cat_nom = None
    if ref.categorie_id:
        cat = db.query(Categorie).filter(Categorie.id == ref.categorie_id).first()
        cat_nom = cat.nom if cat else None

    rows = _offers_with_snapshot(db, tenant_id, produit_id)

    offres_par_site = []
    prices = []
    for o, site_name, site_slug, snap_prix, snap_prix_promo, snap_stock, snap_date in rows:
        price = float(snap_prix) if snap_prix is not None else None
        if price is not None:
            prices.append(price)
        offres_par_site.append(OffreParSite(
            site_name=site_name,
            site_slug=site_slug,
            offre_id=o.id,
            prix_original=price,
            prix_en_promotion=float(snap_prix_promo) if snap_prix_promo is not None else None,
            est_en_promotion=o.est_en_promotion,
            statut_stock=snap_stock,
            url_produit=o.url_produit,
            image=o.image,
            score_qualite=o.score_qualite,
            match_layer=o.match_layer,
            date_derniere_observation=snap_date,
        ))

    prix_min, prix_max, prix_moyen = _price_stats(prices)
    ecart_abs = (prix_max - prix_min) if prix_min is not None and prix_max is not None else None
    ecart_pct = (ecart_abs / prix_min * 100) if ecart_abs is not None and prix_min and prix_min > 0 else None

    if prix_min is not None:
        for o in offres_par_site:
            o.is_best_price = (
                o.prix_original is not None
                and float(o.prix_original) <= prix_min * 1.001
            )

    return ProduitDetail(
        referentiel=ReferentielInfo(
            id=ref.id,
            nom_produit=ref.nom_produit,
            marque=ref.marque,
            description=ref.description,
            image=ref.image,
            categorie_nom=cat_nom,
        ),
        offres_par_site=offres_par_site,
        prix_min=prix_min,
        prix_max=prix_max,
        prix_moyen=prix_moyen,
        ecart_absolu=round(ecart_abs, 3) if ecart_abs is not None else None,
        ecart_pct=round(ecart_pct, 2) if ecart_pct is not None else None,
    )


# ── 3. Comparison chart ───────────────────────────────────────────────────────

@router.get("/{produit_id}/comparison")
def get_product_comparison(
    produit_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    ref = _check_scope(db, tenant_id, produit_id)
    rows = _offers_with_snapshot(db, tenant_id, produit_id)

    prices = [float(r[3]) for r in rows if r[3] is not None]
    prix_min, prix_max, prix_moyen = _price_stats(prices)

    sites = []
    for o, site_name, site_slug, snap_prix, snap_prix_promo, snap_stock, snap_date in rows:
        price = float(snap_prix) if snap_prix is not None else None
        ecart_abs = (price - prix_min) if price is not None and prix_min is not None else None
        ecart_pct = (ecart_abs / prix_min * 100) if ecart_abs is not None and prix_min and prix_min > 0 else None
        sites.append(ComparisonSite(
            site_name=site_name,
            site_slug=site_slug,
            offre_id=o.id,
            prix_courant=price,
            prix_promotion=float(snap_prix_promo) if snap_prix_promo is not None else None,
            est_en_promotion=o.est_en_promotion,
            statut_stock=snap_stock,
            ecart_vs_min_absolu=round(ecart_abs, 3) if ecart_abs is not None else None,
            ecart_vs_min_pct=round(ecart_pct, 2) if ecart_pct is not None else None,
            is_best_price=(
                price is not None and prix_min is not None
                and float(price) <= float(prix_min) * 1.001
            ),
        ))

    return ProductComparison(
        produit_nom=ref.nom_produit,
        sites=sites,
        prix_min=prix_min,
        prix_max=prix_max,
        prix_moyen=prix_moyen,
    )


# ── 4. Price history chart ────────────────────────────────────────────────────

@router.get("/{produit_id}/history")
def get_product_history(
    produit_id: int,
    period: Literal["7d", "30d", "90d"] = Query("30d"),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    ref = _check_scope(db, tenant_id, produit_id)

    days = {"7d": 7, "30d": 30, "90d": 90}[period]
    today = date.today()
    since_date = today - timedelta(days=days)
    since_dt = datetime(since_date.year, since_date.month, since_date.day, tzinfo=timezone.utc)
    until_dt = since_dt + timedelta(days=days + 1)

    labels = [(since_date + timedelta(days=i)).isoformat() for i in range(days + 1)]

    offer_rows = (
        tenant_offers_query(db, tenant_id)
        .filter(OffreNormalisee.produit_id == produit_id)
        .add_columns(
            SiteSource.name.label("site_name"),
            SiteSource.scraper_id.label("site_slug"),
        )
        .outerjoin(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .outerjoin(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .all()
    )

    series = []
    for offre, site_name, site_slug in offer_rows:
        all_snaps = (
            db.query(Snapshot)
            .filter(Snapshot.offre_id == offre.id)
            .filter(Snapshot.date_debut_observation < until_dt)
            .filter(
                Snapshot.date_fin_observation.is_(None) |
                (Snapshot.date_fin_observation >= since_dt)
            )
            .order_by(Snapshot.date_debut_observation.asc())
            .all()
        )

        prix_list: list[float | None] = []
        promo_list: list[bool | None] = []

        for label in labels:
            label_d = date.fromisoformat(label)
            label_start = datetime(label_d.year, label_d.month, label_d.day, tzinfo=timezone.utc)
            label_end = label_start + timedelta(days=1)

            active = None
            for snap in reversed(all_snaps):
                if snap.date_debut_observation < label_end:
                    if snap.date_fin_observation is None or snap.date_fin_observation >= label_start:
                        active = snap
                        break

            if active and active.prix_original is not None:
                prix_list.append(float(active.prix_original))
                promo_list.append(
                    active.prix_en_promotion is not None and
                    float(active.prix_en_promotion) < float(active.prix_original)
                )
            else:
                prix_list.append(None)
                promo_list.append(None)

        series.append(PriceSeries(site_name=site_name, site_slug=site_slug, prix=prix_list, en_promo=promo_list))

    return ProductHistory(produit_nom=ref.nom_produit, labels=labels, series=series)


# ── Scope (périmètre) router ──────────────────────────────────────────────────

scope_router = APIRouter(prefix="/scope")

_RM_ONLY = ("RESP_MARKETING",)
_PLAN_LIMITS = {"BASIC": 50, "MEDIUM": 150, "PREMIUM": None}


@scope_router.get("/available")
def get_available_categories(
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    in_scope = (
        db.query(TenantCategorie.categorie_id)
        .filter(TenantCategorie.tenant_id == tenant_id)
        .subquery()
    )
    query = (
        db.query(
            Categorie.id,
            Categorie.nom,
            Categorie.id_parent,
            func.count(func.distinct(OffreNormalisee.produit_id)).label("nb_produits"),
        )
        .outerjoin(OffreNormalisee, OffreNormalisee.categorie_id == Categorie.id)
        .filter(Categorie.id.notin_(in_scope))
        .group_by(Categorie.id, Categorie.nom, Categorie.id_parent)
    )
    if q:
        query = query.filter(Categorie.nom.ilike(f"%{q}%"))
    rows = query.order_by(Categorie.nom.asc()).all()
    return [
        {"id": r.id, "nom": r.nom, "id_parent": r.id_parent, "nb_produits": r.nb_produits or 0}
        for r in rows
    ]


class AddScopeBody(BaseModel):
    categorie_ids: list[int]


@scope_router.post("/add", status_code=201)
def add_scope_categories(
    body: AddScopeBody,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_RM_ONLY)),
):
    tenant_id = current_user.tenant_id
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    plan = tenant.plan_abonnement if tenant else "BASIC"
    max_cat = _PLAN_LIMITS.get(plan)

    current_count = (
        db.query(func.count(TenantCategorie.categorie_id))
        .filter(TenantCategorie.tenant_id == tenant_id)
        .scalar()
    ) or 0

    if max_cat is not None and current_count + len(body.categorie_ids) > max_cat:
        raise HTTPException(
            status_code=400,
            detail=f"Quota atteint ({max_cat} catégories max pour le plan {plan})",
        )

    added = 0
    for cat_id in body.categorie_ids:
        exists = (
            db.query(TenantCategorie)
            .filter_by(tenant_id=tenant_id, categorie_id=cat_id)
            .first()
        )
        if not exists:
            db.add(TenantCategorie(tenant_id=tenant_id, categorie_id=cat_id))
            added += 1
    db.commit()
    return {"added": added, "total": current_count + added}


@scope_router.delete("/remove/{categorie_id}", status_code=204)
def remove_scope_category(
    categorie_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_RM_ONLY)),
):
    tenant_id = current_user.tenant_id
    current_count = (
        db.query(func.count(TenantCategorie.categorie_id))
        .filter(TenantCategorie.tenant_id == tenant_id)
        .scalar()
    ) or 0
    if current_count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Au moins une catégorie doit rester dans votre périmètre",
        )
    tc = db.query(TenantCategorie).filter_by(tenant_id=tenant_id, categorie_id=categorie_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée dans votre périmètre")
    db.delete(tc)
    db.commit()
