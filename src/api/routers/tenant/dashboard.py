from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.common.models import (
    Categorie, Evenement, Notification, OffreNormalisee,
    Scrapper, SiteSource, Snapshot, Tenant, TenantCategorie,
)

router = APIRouter(prefix="/dashboard")

_ROLES = ("MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING")


@router.get("/overview")
def get_overview(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id

    tenant_offer_ids = (
        db.query(OffreNormalisee.id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(
            TenantCategorie.tenant_id == tenant_id,
            OffreNormalisee.categorie_id.isnot(None),
        )
        .subquery()
    )

    derniere_collecte = (
        db.query(func.max(Scrapper.date_debut))
        .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
        .filter(OffreNormalisee.id.in_(tenant_offer_ids))
        .scalar()
    )

    offres_total = (
        db.query(func.count(OffreNormalisee.id))
        .filter(OffreNormalisee.id.in_(tenant_offer_ids))
        .scalar() or 0
    )

    sites_actifs = (
        db.query(func.count(func.distinct(SiteSource.id)))
        .join(Scrapper, Scrapper.site_source_id == SiteSource.id)
        .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
        .filter(OffreNormalisee.id.in_(tenant_offer_ids))
        .scalar() or 0
    )

    now = datetime.now(timezone.utc)
    seven_days_ago  = now - timedelta(days=7)
    yesterday_start = now - timedelta(days=1)

    def count_events(type_filter, since):
        q = (
            db.query(func.count(Evenement.id))
            .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
            .filter(
                OffreNormalisee.id.in_(tenant_offer_ids),
                Evenement.date_detection >= since,
            )
        )
        if type_filter:
            types = type_filter if isinstance(type_filter, tuple) else (type_filter,)
            q = q.filter(Evenement.type_evenement.in_(types))
        return q.scalar() or 0

    _PRICE_TYPES = ("HAUSSE_PRIX", "BAISSE_PRIX")
    variations_7j    = count_events(_PRICE_TYPES, seven_days_ago)
    variations_hier  = count_events(_PRICE_TYPES, yesterday_start)
    evenements_7j    = count_events(None, seven_days_ago)

    promos_7j        = count_events("DEBUT_PROMOTION", seven_days_ago)
    promos_hier      = count_events("DEBUT_PROMOTION", yesterday_start)

    ruptures_7j      = count_events("RUPTURE_STOCK", seven_days_ago)
    ruptures_hier    = count_events("RUPTURE_STOCK", yesterday_start)

    nouveaux_7j      = count_events("NOUVELLE_OFFRE_DECOUVERTE", seven_days_ago)

    notif_non_lues = (
        db.query(func.count(Notification.id))
        .filter(
            Notification.id_utilisateur == current_user.id,
            Notification.lu == False,
        )
        .scalar() or 0
    )

    recent_rows = (
        db.query(Evenement, OffreNormalisee, SiteSource)
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .join(Scrapper, OffreNormalisee.scraper_id == Scrapper.id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .filter(OffreNormalisee.id.in_(tenant_offer_ids))
        .order_by(Evenement.date_detection.desc())
        .limit(5)
        .all()
    )

    def _delta(avant, apres):
        if avant is None or apres is None:
            return None, None
        avant_f = float(avant)
        apres_f = float(apres)
        delta_abs = round(apres_f - avant_f, 3)
        delta_pct = round((apres_f - avant_f) / avant_f * 100, 1) if avant_f != 0 else None
        return delta_abs, delta_pct

    evenements_recents = []
    for e, o, s in recent_rows:
        delta_abs, delta_pct = _delta(e.valeur_avant, e.valeur_apres)
        evenements_recents.append({
            "id":             e.id,
            "type_evenement": e.type_evenement,
            "date_detection": e.date_detection,
            "offre_id":       o.id,
            "offre_nom":      o.nom,
            "valeur_avant":   float(e.valeur_avant) if e.valeur_avant is not None else None,
            "valeur_apres":   float(e.valeur_apres) if e.valeur_apres is not None else None,
            "delta_absolu":   delta_abs,
            "delta_pct":      delta_pct,
            "site_name":      s.name,
            "site_slug":      s.scraper_id,
        })

    # Compute next scrape time from last completed scraper run
    last_scrape = (
        db.query(func.max(Scrapper.date_fin))
        .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
        .filter(OffreNormalisee.id.in_(tenant_offer_ids))
        .scalar()
    )
    if last_scrape:
        if last_scrape.tzinfo is None:
            last_scrape = last_scrape.replace(tzinfo=timezone.utc)
        next_scrape = last_scrape + timedelta(hours=24)
        if next_scrape < now:
            next_scrape = now + timedelta(hours=24)
        prochaine = next_scrape.isoformat()
    else:
        prochaine = None

    return {
        "derniere_collecte":        derniere_collecte,
        "prochaine_collecte":       prochaine,
        "offres_total":             offres_total,
        "sites_actifs":             sites_actifs,
        "variations_de_prix_7j":    variations_7j,
        "variations_delta_vs_hier": variations_7j - variations_hier,
        "evenements_7j":            evenements_7j,
        "nouvelles_promos_7j":      promos_7j,
        "promos_delta_vs_hier":     promos_7j - promos_hier,
        "ruptures_stock_7j":        ruptures_7j,
        "ruptures_delta_vs_hier":   ruptures_7j - ruptures_hier,
        "nouveaux_produits_7j":     nouveaux_7j,
        "notifications_non_lues":   notif_non_lues,
        "evenements_recents":       evenements_recents,
    }


@router.get("/trends")
def get_trends(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    """Daily event counts over the last 7 days, for dashboard sparklines."""
    tenant_id = current_user.tenant_id

    tenant_offer_ids = (
        db.query(OffreNormalisee.id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(
            TenantCategorie.tenant_id == tenant_id,
            OffreNormalisee.categorie_id.isnot(None),
        )
        .subquery()
    )

    now   = datetime.now(timezone.utc)
    since = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

    rows = (
        db.query(
            func.date(Evenement.date_detection).label("jour"),
            Evenement.type_evenement,
            func.count(Evenement.id).label("cnt"),
        )
        .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
        .filter(
            OffreNormalisee.id.in_(tenant_offer_ids),
            Evenement.date_detection >= since,
        )
        .group_by("jour", Evenement.type_evenement)
        .all()
    )

    days = [(since + timedelta(days=i)).date() for i in range(7)]
    by_day = {d: {"variations": 0, "promos": 0, "ruptures": 0} for d in days}
    for jour, type_evenement, cnt in rows:
        bucket = by_day.get(jour)
        if bucket is None:
            continue
        if type_evenement in ("HAUSSE_PRIX", "BAISSE_PRIX"):
            bucket["variations"] += cnt
        elif type_evenement == "DEBUT_PROMOTION":
            bucket["promos"] += cnt
        elif type_evenement == "RUPTURE_STOCK":
            bucket["ruptures"] += cnt

    return {
        "dates":      [d.isoformat() for d in days],
        "variations": [by_day[d]["variations"] for d in days],
        "promos":     [by_day[d]["promos"] for d in days],
        "ruptures":   [by_day[d]["ruptures"] for d in days],
    }


@router.get("/ruptures")
def get_ruptures(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    scope_produit_ids = (
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

    query = (
        db.query(OffreNormalisee, SiteSource, Snapshot)
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .outerjoin(Snapshot, and_(
            Snapshot.offre_id == OffreNormalisee.id,
            Snapshot.date_fin_observation.is_(None),
        ))
        .filter(
            OffreNormalisee.statut_stock == 'RUPTURE',
            OffreNormalisee.produit_id.in_(scope_produit_ids),
        )
    )

    if tenant and tenant.profil_client == 'SITE_ECOMMERCE' and tenant.own_site_id:
        query = query.filter(Scrapper.site_source_id != tenant.own_site_id)

    rows = (
        query
        .order_by(Snapshot.date_debut_observation.desc().nullslast())
        .limit(10)
        .all()
    )

    return [
        {
            "offre_id":       offre.id,
            "offre_nom":      offre.nom,
            "site_name":      site.name,
            "site_slug":      site.scraper_id,
            "date_detection": snap.date_debut_observation if snap else None,
            "produit_id":     offre.produit_id,
        }
        for offre, site, snap in rows
    ]
