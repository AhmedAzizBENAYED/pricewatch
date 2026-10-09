from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import ScrapperRunShort, SiteSourceDetail, SiteSourceListItem
from src.common.models import JournalAudit, OffreNormalisee, Scrapper, SiteSource

router = APIRouter(prefix="/sources")


def _nb_offres_sq(db: Session):
    return (
        db.query(func.count(OffreNormalisee.id))
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .filter(Scrapper.site_source_id == SiteSource.id)
        .correlate(SiteSource)
        .scalar_subquery()
        .label("nb_offres")
    )


def _last_scrape_sq(db: Session):
    return (
        db.query(func.max(Scrapper.date_debut))
        .filter(Scrapper.site_source_id == SiteSource.id)
        .correlate(SiteSource)
        .scalar_subquery()
        .label("last_scrape_at")
    )


@router.get("")
def list_sources(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    rows = db.query(SiteSource, _nb_offres_sq(db), _last_scrape_sq(db)).all()
    return [
        SiteSourceListItem(
            id=s.id,
            url=s.url,
            name=s.name,
            est_actif=s.est_actif,
            scraper_id=s.scraper_id,
            nb_offres=nb_offres or 0,
            last_scrape_at=last_scrape,
        )
        for s, nb_offres, last_scrape in rows
    ]


@router.get("/{source_id}")
def get_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    source = db.query(SiteSource).filter(SiteSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    nb_offres = (
        db.query(func.count(OffreNormalisee.id))
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .filter(Scrapper.site_source_id == source_id)
        .scalar() or 0
    )
    last_scrape = (
        db.query(func.max(Scrapper.date_debut))
        .filter(Scrapper.site_source_id == source_id)
        .scalar()
    )

    offres_per_run_sq = (
        db.query(func.count(OffreNormalisee.id))
        .filter(OffreNormalisee.scraper_id == Scrapper.id)
        .correlate(Scrapper)
        .scalar_subquery()
        .label("offres")
    )
    recent_runs_rows = (
        db.query(Scrapper, offres_per_run_sq)
        .filter(Scrapper.site_source_id == source_id)
        .order_by(Scrapper.date_debut.desc().nullslast())
        .limit(10)
        .all()
    )

    recent_runs = []
    for sc, offres in recent_runs_rows:
        duree = None
        if sc.date_debut and sc.date_fin:
            duree = int((sc.date_fin - sc.date_debut).total_seconds())
        recent_runs.append(ScrapperRunShort(
            id=sc.id,
            statut=sc.statut,
            date_debut=sc.date_debut,
            date_fin=sc.date_fin,
            offres_collectees=offres or 0,
            duree_secondes=duree,
        ))

    return SiteSourceDetail(
        id=source.id,
        url=source.url,
        name=source.name,
        est_actif=source.est_actif,
        scraper_id=source.scraper_id,
        nb_offres=nb_offres,
        last_scrape_at=last_scrape,
        recent_runs=recent_runs,
    )


class ToggleRequest(BaseModel):
    active: bool


@router.patch("/{source_id}/toggle")
def toggle_source(
    source_id: int,
    body: ToggleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    source = db.query(SiteSource).filter(SiteSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    prev = source.est_actif
    source.est_actif = body.active
    db.add(JournalAudit(
        action="SOURCE_TOGGLE",
        valeurs_avant={"source_id": source_id, "est_actif": prev},
        valeurs_apres={"source_id": source_id, "est_actif": body.active},
    ))
    db.commit()
    db.refresh(source)

    nb_offres = (
        db.query(func.count(OffreNormalisee.id))
        .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .filter(Scrapper.site_source_id == source_id)
        .scalar() or 0
    )
    last_scrape = (
        db.query(func.max(Scrapper.date_debut))
        .filter(Scrapper.site_source_id == source_id)
        .scalar()
    )

    return SiteSourceListItem(
        id=source.id,
        url=source.url,
        name=source.name,
        est_actif=source.est_actif,
        scraper_id=source.scraper_id,
        nb_offres=nb_offres,
        last_scrape_at=last_scrape,
    )