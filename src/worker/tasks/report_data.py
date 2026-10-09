"""
Pure SQLAlchemy data-collection functions for the report pipeline.
No LLM, no langchain — importable from both the Celery task and graph nodes.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.common.models.offre import OffreNormalisee
from src.common.models.evenement import Evenement
from src.common.models.scrapper import Scrapper
from src.common.models.site_source import SiteSource
from src.common.models.snapshot import Snapshot
from src.common.models.categorie import Categorie
from src.common.models.tenant_categorie import TenantCategorie


def _offer_ids_sq(db: Session, tenant_id: int):
    return (
        db.query(OffreNormalisee.id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == tenant_id,
                OffreNormalisee.categorie_id.isnot(None))
        .subquery()
    )


def query_overview(db: Session, tenant_id: int) -> dict:
    sq  = _offer_ids_sq(db, tenant_id)
    ago = datetime.now(timezone.utc) - timedelta(days=7)
    return {
        "offres_total":  db.query(func.count(OffreNormalisee.id))
            .filter(OffreNormalisee.id.in_(sq)).scalar() or 0,
        "sites_actifs":  db.query(func.count(func.distinct(SiteSource.id)))
            .join(Scrapper, Scrapper.site_source_id == SiteSource.id)
            .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
            .filter(OffreNormalisee.id.in_(sq)).scalar() or 0,
        "evenements_7j": db.query(func.count(Evenement.id))
            .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
            .filter(OffreNormalisee.id.in_(sq), Evenement.date_detection >= ago)
            .scalar() or 0,
        "promos_actives": db.query(func.count(OffreNormalisee.id))
            .filter(OffreNormalisee.id.in_(sq),
                    OffreNormalisee.est_en_promotion == True).scalar() or 0,
        "ruptures_stock": db.query(func.count(OffreNormalisee.id))
            .filter(OffreNormalisee.id.in_(sq),
                    OffreNormalisee.statut_stock == "RUPTURE").scalar() or 0,
    }


def query_events(db: Session, tenant_id: int, limit: int = 20) -> list:
    sq = _offer_ids_sq(db, tenant_id)
    rows = (
        db.query(Evenement, OffreNormalisee, SiteSource)
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .join(Scrapper, OffreNormalisee.scraper_id == Scrapper.id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .filter(OffreNormalisee.id.in_(sq))
        .order_by(Evenement.date_detection.desc()).limit(limit).all()
    )
    out = []
    for e, o, s in rows:
        av = float(e.valeur_avant) if e.valeur_avant is not None else None
        ap = float(e.valeur_apres) if e.valeur_apres is not None else None
        delta = round((ap - av) / av * 100, 1) if av and ap and av != 0 else None
        out.append({
            "type": e.type_evenement,
            "date": e.date_detection.isoformat()[:10] if e.date_detection else None,
            "produit": o.nom or "", "site": s.name or "",
            "prix_avant": av, "prix_apres": ap, "variation_pct": delta,
        })
    return out


def query_positioning(db: Session, tenant_id: int,
                      profil_client: str, own_site_id, own_brand) -> dict:
    from sqlalchemy import case as sa_case
    if not own_site_id and not own_brand:
        return {"error": "Positionnement non disponible"}

    snap_sq = (db.query(Snapshot.offre_id, Snapshot.prix_original)
               .filter(Snapshot.date_fin_observation.is_(None)).subquery())
    scope_sq = (db.query(OffreNormalisee.produit_id)
                .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
                .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
                .filter(TenantCategorie.tenant_id == tenant_id,
                        OffreNormalisee.produit_id.isnot(None))
                .distinct().subquery())

    if profil_client == "SITE_ECOMMERCE" and own_site_id:
        rows = (db.query(
            func.min(OffreNormalisee.nom).label("nom"),
            func.min(sa_case((Scrapper.site_source_id == own_site_id,
                              snap_sq.c.prix_original), else_=None)).label("own_price"),
            func.avg(sa_case((Scrapper.site_source_id != own_site_id,
                              snap_sq.c.prix_original), else_=None)).label("market_avg"),
        ).join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
         .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
         .filter(OffreNormalisee.produit_id.in_(scope_sq))
         .group_by(OffreNormalisee.produit_id).all())
    elif profil_client == "MARQUE" and own_brand:
        rows = (db.query(
            func.min(OffreNormalisee.nom).label("nom"),
            func.min(sa_case((func.lower(OffreNormalisee.marque) == own_brand.lower(),
                              snap_sq.c.prix_original), else_=None)).label("own_price"),
            func.avg(sa_case((func.lower(OffreNormalisee.marque) != own_brand.lower(),
                              snap_sq.c.prix_original), else_=None)).label("market_avg"),
        ).join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
         .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
         .filter(OffreNormalisee.produit_id.in_(scope_sq),
                 OffreNormalisee.marque.isnot(None))
         .group_by(OffreNormalisee.produit_id).all())
    else:
        return {"error": "Configuration manquante"}

    moins = dans = plus = 0
    top = []
    for r in rows:
        if r.own_price is None or r.market_avg is None:
            continue
        op, ap_ = float(r.own_price), float(r.market_avg)
        diff = round((op - ap_) / ap_ * 100, 1) if ap_ else 0
        if op <= ap_ * 0.95:
            moins += 1
        elif op >= ap_ * 1.05:
            plus += 1
            top.append({"produit": r.nom, "own_prix": round(op, 2),
                         "avg_prix": round(ap_, 2), "diff_pct": diff})
        else:
            dans += 1

    total = moins + dans + plus
    pct = lambda n: round(n / total * 100, 1) if total else 0.0
    top.sort(key=lambda x: x["diff_pct"], reverse=True)
    return {"total_produits": total, "pct_moins_cher": pct(moins),
            "pct_dans_moyenne": pct(dans), "pct_plus_cher": pct(plus),
            "top_surpasses": top[:5]}


def query_competitors(db: Session, tenant_id: int, own_site_id) -> dict:
    sq  = _offer_ids_sq(db, tenant_id)
    ago = datetime.now(timezone.utc) - timedelta(days=7)
    q   = db.query(SiteSource)
    if own_site_id:
        q = q.filter(SiteSource.id != own_site_id)
    result = []
    for site in q.all():
        drops = (db.query(func.count(Evenement.id))
                 .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
                 .join(Scrapper, OffreNormalisee.scraper_id == Scrapper.id)
                 .filter(OffreNormalisee.id.in_(sq), Scrapper.site_source_id == site.id,
                         Evenement.type_evenement == "BAISSE_PRIX",
                         Evenement.date_detection >= ago).scalar() or 0)
        promos = (db.query(func.count(OffreNormalisee.id))
                  .join(Scrapper, OffreNormalisee.scraper_id == Scrapper.id)
                  .filter(OffreNormalisee.id.in_(sq), Scrapper.site_source_id == site.id,
                          OffreNormalisee.est_en_promotion == True).scalar() or 0)
        result.append({"site": site.name, "site_slug": site.scraper_id,
                        "baisses_prix_7j": drops, "promos_actives": promos,
                        "agressivite": drops + promos})
    result.sort(key=lambda x: x["agressivite"], reverse=True)
    return {"concurrents": result}


def query_stock_ruptures(db: Session, tenant_id: int, own_site_id) -> list:
    sq = _offer_ids_sq(db, tenant_id)
    q  = (db.query(OffreNormalisee, SiteSource)
          .join(Scrapper, OffreNormalisee.scraper_id == Scrapper.id)
          .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
          .filter(OffreNormalisee.id.in_(sq),
                  OffreNormalisee.statut_stock == "RUPTURE"))
    if own_site_id:
        q = q.filter(Scrapper.site_source_id != own_site_id)
    return [{"produit": o.nom, "marque": o.marque, "site": s.name}
            for o, s in q.order_by(OffreNormalisee.nom).limit(20).all()]
