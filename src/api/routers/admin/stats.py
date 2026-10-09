from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import (
    MatchingPipelineStats, PlatformStats, SiteStatsOut, TenantActivityItem,
)
from src.common.models import (
    Candidat, Categorie, OffreNormalisee, Referentiel,
    Scrapper, SiteSource, Tenant, TenantCategorie, Utilisateur,
)

router = APIRouter(prefix="/stats")


@router.get("")
def get_platform_stats(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    nb_tenants = select(func.count()).select_from(Tenant.__table__).scalar_subquery()
    nb_tenants_actifs = (
        select(func.count()).select_from(Tenant.__table__)
        .where(Tenant.__table__.c.est_actif == True)
        .scalar_subquery()
    )
    nb_utilisateurs = select(func.count()).select_from(Utilisateur.__table__).scalar_subquery()
    nb_offres = select(func.count()).select_from(OffreNormalisee.__table__).scalar_subquery()
    nb_referentiels = select(func.count()).select_from(Referentiel.__table__).scalar_subquery()
    nb_candidats = select(func.count()).select_from(Candidat.__table__).scalar_subquery()
    nb_scrappers = select(func.count()).select_from(Scrapper.__table__).scalar_subquery()
    nb_scrappers_en_cours = (
        select(func.count()).select_from(Scrapper.__table__)
        .where(Scrapper.__table__.c.statut == "EN_COURS")
        .scalar_subquery()
    )

    row = db.execute(
        select(
            nb_tenants.label("nb_tenants"),
            nb_tenants_actifs.label("nb_tenants_actifs"),
            nb_utilisateurs.label("nb_utilisateurs"),
            nb_offres.label("nb_offres"),
            nb_referentiels.label("nb_referentiels"),
            nb_candidats.label("nb_candidats"),
            nb_scrappers.label("nb_scrappers"),
            nb_scrappers_en_cours.label("nb_scrappers_en_cours"),
        )
    ).one()

    scrapers_echoue_24h = (
        db.query(func.count(Scrapper.id))
        .filter(
            Scrapper.statut == "ECHOUE",
            Scrapper.date_debut >= datetime.now(timezone.utc) - timedelta(hours=24),
        )
        .scalar() or 0
    )

    return PlatformStats(
        nb_tenants=row.nb_tenants,
        nb_tenants_actifs=row.nb_tenants_actifs,
        nb_utilisateurs=row.nb_utilisateurs,
        nb_offres=row.nb_offres,
        nb_referentiels=row.nb_referentiels,
        nb_candidats=row.nb_candidats,
        nb_scrappers=row.nb_scrappers,
        nb_scrappers_en_cours=row.nb_scrappers_en_cours,
        scrapers_echoue_24h=scrapers_echoue_24h,
    )


@router.get("/scraping")
def get_scraping_stats(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    offers_per_scrapper = (
        db.query(
            OffreNormalisee.scraper_id.label("scrapper_id"),
            func.count(OffreNormalisee.id).label("offer_count"),
        )
        .group_by(OffreNormalisee.scraper_id)
        .subquery()
    )

    rows = (
        db.query(
            SiteSource.scraper_id.label("site_id"),
            SiteSource.name.label("site_name"),
            func.count(Scrapper.id).label("total_runs"),
            func.sum(case((Scrapper.statut == "TERMINE", 1), else_=0)).label("successful"),
            func.sum(case((Scrapper.statut == "ECHOUE",  1), else_=0)).label("failed"),
            func.coalesce(func.avg(offers_per_scrapper.c.offer_count), 0.0).label("avg_offres_per_run"),
            func.max(Scrapper.date_debut).label("last_run_at"),
        )
        .join(Scrapper, Scrapper.site_source_id == SiteSource.id)
        .outerjoin(offers_per_scrapper, offers_per_scrapper.c.scrapper_id == Scrapper.id)
        .group_by(SiteSource.id, SiteSource.scraper_id, SiteSource.name)
        .all()
    )

    return [
        SiteStatsOut(
            site_id=r.site_id,
            site_name=r.site_name,
            total_runs=r.total_runs,
            successful=r.successful or 0,
            failed=r.failed or 0,
            avg_offres_per_run=float(r.avg_offres_per_run or 0),
            last_run_at=r.last_run_at,
        )
        for r in rows
    ]


@router.get("/matching")
def get_matching_stats(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    counts = (
        db.query(
            func.count(Candidat.id).label("total"),
            func.sum(case((Candidat.statut == "INCERTAIN", 1), else_=0)).label("incertain"),
            func.sum(case((Candidat.statut == "VALIDE",    1), else_=0)).label("valide"),
            func.sum(case((Candidat.statut == "REJETE",    1), else_=0)).label("rejete"),
            func.avg(Candidat.score_confluence).label("avg_score"),
            func.sum(case(
                (and_(Candidat.statut == "VALIDE", Candidat.id_validateur.is_(None)), 1),
                else_=0,
            )).label("auto"),
            func.sum(case(
                (and_(Candidat.statut == "VALIDE", Candidat.id_validateur.isnot(None)), 1),
                else_=0,
            )).label("humaine"),
        )
        .one()
    )

    valide_total = counts.valide or 0
    auto    = counts.auto    or 0
    humaine = counts.humaine or 0
    taux_auto    = round(auto    / valide_total * 100, 2) if valide_total else None
    taux_humaine = round(humaine / valide_total * 100, 2) if valide_total else None

    offres_matchees = (
        db.query(func.count(OffreNormalisee.id))
        .filter(OffreNormalisee.produit_id.isnot(None))
        .scalar() or 0
    )
    offres_total = db.query(func.count(OffreNormalisee.id)).scalar() or 0

    return MatchingPipelineStats(
        total_candidats=counts.total or 0,
        incertain=counts.incertain or 0,
        valide=valide_total,
        rejete=counts.rejete or 0,
        avg_score=float(counts.avg_score) if counts.avg_score is not None else None,
        taux_validation_auto_pct=taux_auto,
        taux_validation_humaine_pct=taux_humaine,
        offres_matchees=offres_matchees,
        offres_non_matchees=offres_total - offres_matchees,
    )


@router.get("/tenants")
def get_tenant_activity(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    nb_users_sq = (
        db.query(func.count(Utilisateur.id))
        .filter(Utilisateur.tenant_id == Tenant.id)
        .correlate(Tenant)
        .scalar_subquery()
        .label("nb_users")
    )
    nb_cats_sq = (
        db.query(func.count(TenantCategorie.categorie_id))
        .filter(TenantCategorie.tenant_id == Tenant.id)
        .correlate(Tenant)
        .scalar_subquery()
        .label("nb_categories")
    )
    nb_offres_sq = (
        db.query(func.count(OffreNormalisee.id))
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == Tenant.id)
        .correlate(Tenant)
        .scalar_subquery()
        .label("nb_offres")
    )
    last_scrape_sq = (
        db.query(func.max(Scrapper.date_debut))
        .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == Tenant.id)
        .correlate(Tenant)
        .scalar_subquery()
        .label("last_scrape_at")
    )

    rows = (
        db.query(Tenant, nb_users_sq, nb_cats_sq, nb_offres_sq, last_scrape_sq)
        .order_by(Tenant.nom_organisation)
        .all()
    )

    return [
        TenantActivityItem(
            tenant_id=t.id,
            nom_organisation=t.nom_organisation,
            nb_users=nb_users or 0,
            nb_categories=nb_cats or 0,
            nb_offres=nb_offres or 0,
            last_scrape_at=last_scrape,
        )
        for t, nb_users, nb_cats, nb_offres, last_scrape in rows
    ]