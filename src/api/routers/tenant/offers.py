from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role, tenant_offers_query
from src.api.schemas.admin import PaginationMeta
from src.api.schemas.tenant_offers import (
    OffreDetail, OffreHistory, OffreListItem, ScrapperShort, SnapshotOut,
)
from src.common.models import (
    Categorie, OffreNormalisee, Scrapper, Snapshot, SiteSource,
)

router = APIRouter(prefix="/offers")

_ROLES = ("MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING")


@router.get("")
def list_offers(
    q: str | None = Query(None),
    marque: str | None = Query(None),
    categorie_id: int | None = Query(None),
    site_id: int | None = Query(None),
    en_promo: bool | None = Query(None),
    en_stock: bool | None = Query(None),
    sort: str = Query("nom"),
    order: str = Query("asc"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    base = (
        tenant_offers_query(db, tenant_id)
        .add_columns(
            SiteSource.name.label("site_name"),
            Categorie.nom.label("cat_nom"),
            Snapshot.prix_original.label("snap_prix"),
            Snapshot.prix_en_promotion.label("snap_prix_promo"),
        )
        .outerjoin(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .outerjoin(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .outerjoin(Snapshot, and_(
            Snapshot.offre_id == OffreNormalisee.id,
            Snapshot.date_fin_observation.is_(None),
        ))
    )

    if q:
        base = base.filter(
            OffreNormalisee.nom.ilike(f"%{q}%") | OffreNormalisee.marque.ilike(f"%{q}%")
        )
    if marque:
        base = base.filter(OffreNormalisee.marque == marque)
    if categorie_id:
        base = base.filter(OffreNormalisee.categorie_id == categorie_id)
    if site_id:
        base = base.filter(SiteSource.id == site_id)
    if en_promo:
        base = base.filter(OffreNormalisee.est_en_promotion == True)
    if en_stock:
        base = base.filter(OffreNormalisee.statut_stock == "IN_STOCK")

    total = base.with_entities(func.count(func.distinct(OffreNormalisee.id))).scalar()

    sort_col = Snapshot.prix_original if sort == "prix" else OffreNormalisee.nom
    sort_expr = sort_col.desc().nullslast() if order == "desc" else sort_col.asc().nullslast()

    rows = (
        base.order_by(sort_expr)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    data = [
        OffreListItem(
            id=o.id,
            nom=o.nom,
            marque=o.marque,
            image=o.image,
            url_produit=o.url_produit,
            prix_original=float(snap_prix) if snap_prix is not None else None,
            prix_en_promotion=float(snap_prix_promo) if snap_prix_promo is not None else None,
            est_en_promotion=o.est_en_promotion,
            statut_stock=o.statut_stock,
            score_qualite=o.score_qualite,
            site_name=site_name,
            categorie_nom=cat_nom,
            produit_id=o.produit_id,
        ).model_dump()
        for o, site_name, cat_nom, snap_prix, snap_prix_promo in rows
    ]

    return {
        "data": data,
        "meta": PaginationMeta(
            total=total, page=page, limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


@router.get("/{offre_id}")
def get_offer(
    offre_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    offre = tenant_offers_query(db, tenant_id).filter(OffreNormalisee.id == offre_id).first()
    if not offre:
        raise HTTPException(status_code=404, detail="Offer not found")

    snapshot = (
        db.query(Snapshot)
        .filter(Snapshot.offre_id == offre_id, Snapshot.date_fin_observation.is_(None))
        .first()
    )

    prev_snapshot = (
        db.query(Snapshot)
        .filter(
            Snapshot.offre_id == offre_id,
            Snapshot.date_fin_observation.isnot(None),
        )
        .order_by(Snapshot.date_fin_observation.desc())
        .first()
    )

    if (prev_snapshot
            and prev_snapshot.prix_original is not None
            and snapshot is not None
            and snapshot.prix_original is not None):
        delta_abs = round(
            float(snapshot.prix_original) - float(prev_snapshot.prix_original), 3
        )
        delta_pct = round(
            delta_abs / float(prev_snapshot.prix_original) * 100, 1
        )
    else:
        delta_abs = None
        delta_pct = None

    site_name = None
    site_slug = None
    scrapper_out = None
    cat_nom = None

    if offre.scraper_id:
        row = (
            db.query(Scrapper, SiteSource, Categorie)
            .outerjoin(SiteSource, SiteSource.id == Scrapper.site_source_id)
            .outerjoin(Categorie, Categorie.id == offre.categorie_id)
            .filter(Scrapper.id == offre.scraper_id)
            .first()
        )
        if row:
            sc, ss, cat = row
            scrapper_out = ScrapperShort(id=sc.id, date_debut=sc.date_debut, statut=sc.statut)
            site_name = ss.name if ss else None
            site_slug = ss.scraper_id if ss else None
            cat_nom = cat.nom if cat else None

    # ── Metrics from full snapshot history ───────────────────────────────────
    all_snaps = (
        db.query(Snapshot)
        .filter(Snapshot.offre_id == offre_id)
        .order_by(Snapshot.date_debut_observation.asc())
        .all()
    )

    now = datetime.now(timezone.utc)

    def _duration_days(s):
        start = s.date_debut_observation
        end   = s.date_fin_observation or now
        if not start:
            return 0
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return max(0, (end - start).days)

    nb_changements_prix = len({
        float(s.prix_original) for s in all_snaps if s.prix_original is not None
    })
    nb_promotions = sum(1 for s in all_snaps if s.prix_en_promotion is not None)
    jours_en_promotion = sum(_duration_days(s) for s in all_snaps if s.prix_en_promotion is not None)
    jours_en_rupture   = sum(_duration_days(s) for s in all_snaps if s.stock_status == "RUPTURE")

    cutoff_90 = now - timedelta(days=90)
    recent_prices = [
        float(s.prix_original) for s in all_snaps
        if s.prix_original is not None and s.date_debut_observation is not None
        and (s.date_debut_observation if s.date_debut_observation.tzinfo
             else s.date_debut_observation.replace(tzinfo=timezone.utc)) >= cutoff_90
    ]
    prix_moyen_90j = sum(recent_prices) / len(recent_prices) if recent_prices else None

    return OffreDetail(
        id=offre.id,
        nom=offre.nom,
        marque=offre.marque,
        prix_original=float(offre.prix_original) if offre.prix_original is not None else None,
        prix_en_promotion=float(offre.prix_en_promotion) if offre.prix_en_promotion is not None else None,
        prix_unitaire=float(offre.prix_unitaire) if offre.prix_unitaire is not None else None,
        est_en_promotion=offre.est_en_promotion,
        statut_stock=offre.statut_stock,
        image=offre.image,
        url_produit=offre.url_produit,
        description=offre.description,
        score_qualite=offre.score_qualite,
        match_layer=offre.match_layer,
        match_score=offre.match_score,
        produit_id=offre.produit_id,
        specs_normalises=offre.specs_normalises,
        offre_brute=offre.offre_brute,
        site_name=site_name,
        site_slug=site_slug,
        categorie_nom=cat_nom,
        scrapper=scrapper_out,
        snapshot_courant=SnapshotOut.model_validate(snapshot) if snapshot else None,
        metriques={
            "nb_changements_prix": nb_changements_prix,
            "nb_promotions":       nb_promotions,
            "jours_en_promotion":  jours_en_promotion,
            "jours_en_rupture":    jours_en_rupture,
            "prix_moyen_90j":      round(prix_moyen_90j, 3) if prix_moyen_90j is not None else None,
        },
        delta_absolu=delta_abs,
        delta_pct=delta_pct,
        prix_precedent=float(prev_snapshot.prix_original) if prev_snapshot and prev_snapshot.prix_original is not None else None,
    )


@router.get("/{offre_id}/history")
def get_offer_history(
    offre_id: int,
    period: Literal["7d", "30d", "60d", "90d", "all"] = Query("30d"),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    offre = tenant_offers_query(db, tenant_id).filter(OffreNormalisee.id == offre_id).first()
    if not offre:
        raise HTTPException(status_code=404, detail="Offer not found")

    snap_q = db.query(Snapshot).filter(Snapshot.offre_id == offre_id)
    if period != "all":
        days = {"7d": 7, "30d": 30, "60d": 60, "90d": 90}[period]
        since = datetime.now(timezone.utc) - timedelta(days=days)
        snap_q = snap_q.filter(
            Snapshot.date_fin_observation.is_(None) |
            (Snapshot.date_fin_observation >= since)
        )
    snapshots = snap_q.order_by(Snapshot.date_debut_observation.asc()).all()

    site_name = None
    if offre.scraper_id:
        sc_row = (
            db.query(Scrapper, SiteSource)
            .outerjoin(SiteSource, SiteSource.id == Scrapper.site_source_id)
            .filter(Scrapper.id == offre.scraper_id)
            .first()
        )
        if sc_row:
            _, ss = sc_row
            site_name = ss.name if ss else None

    return OffreHistory(
        offre_id=offre_id,
        offre_nom=offre.nom,
        site_name=site_name,
        snapshots=[SnapshotOut.model_validate(s) for s in snapshots],
        total=len(snapshots),
    )
