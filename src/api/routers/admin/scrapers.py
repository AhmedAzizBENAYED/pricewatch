import logging
import os
from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Literal

import redis
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import (
    CategoryStatOut, PaginationMeta,
    ScrapperDetail, ScrapperListItem,
    SiteStatsOut,
)
from src.common.models import OffreNormalisee, Scrapper, SiteSource
from src.common.models.scraping_stat import ScrapingCategoryStat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scrapers")

VALID_SITE_IDS = {
    "mytek", "spacenet", "tunisianet",
    "carrefour", "aziza",
    "geant-tunis-city", "geant-azur-city", "geant-bourgo-mall", "geant-sfax",
}


class ScraperLaunchRequest(BaseModel):
    site_id: str


def _get_redis():
    return redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        db=0,
        decode_responses=True,
    )


# ── /stats MUST be registered before /{id} ───────────────────────────────────

@router.get("/stats")
def get_scraper_stats(
    period: Literal["7d", "30d"] = Query("7d"),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    days = 7 if period == "7d" else 30
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Non-correlated subquery: offer count per scrapper run
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
        .filter(Scrapper.date_debut >= since)
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


@router.post("/launch")
def launch_scraper(
    body: ScraperLaunchRequest,
    current_user=Depends(require_role("ADMIN")),
):
    if body.site_id not in VALID_SITE_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"site_id invalide '{body.site_id}'. Valeurs acceptées: {sorted(VALID_SITE_IDS)}",
        )
    from src.scraper.tasks.pipeline import launch_pipeline
    task = launch_pipeline.delay(site_id=body.site_id)
    return {"task_id": task.id, "site_id": body.site_id}


@router.get("")
def list_scrapers(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    statut: str | None = Query(None),
    site_id: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    offres_sq = (
        db.query(func.count(OffreNormalisee.id))
        .filter(OffreNormalisee.scraper_id == Scrapper.id)
        .correlate(Scrapper)
        .scalar_subquery()
        .label("offres_collectees")
    )

    base = (
        db.query(Scrapper, SiteSource.name.label("site_name"), offres_sq)
        .outerjoin(SiteSource, SiteSource.id == Scrapper.site_source_id)
    )
    count_q = (
        db.query(func.count(Scrapper.id))
        .outerjoin(SiteSource, SiteSource.id == Scrapper.site_source_id)
    )

    if statut:
        base    = base.filter(Scrapper.statut == statut)
        count_q = count_q.filter(Scrapper.statut == statut)
    if site_id:
        base    = base.filter(SiteSource.scraper_id == site_id)
        count_q = count_q.filter(SiteSource.scraper_id == site_id)
    if date_from:
        base    = base.filter(Scrapper.date_debut >= date_from)
        count_q = count_q.filter(Scrapper.date_debut >= date_from)
    if date_to:
        base    = base.filter(Scrapper.date_debut <= date_to)
        count_q = count_q.filter(Scrapper.date_debut <= date_to)

    total = count_q.scalar()
    rows = (
        base.order_by(Scrapper.date_debut.desc().nullslast())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    data = []
    for scrapper, site_name, offres_collectees in rows:
        duree = None
        if scrapper.date_debut and scrapper.date_fin:
            duree = int((scrapper.date_fin - scrapper.date_debut).total_seconds())
        data.append(
            ScrapperListItem(
                id=scrapper.id,
                site_source_id=scrapper.site_source_id,
                site_name=site_name,
                statut=scrapper.statut,
                date_debut=scrapper.date_debut,
                date_fin=scrapper.date_fin,
                offres_collectees=offres_collectees or 0,
                duree_secondes=duree,
            ).model_dump()
        )

    return {
        "data": data,
        "meta": PaginationMeta(
            total=total,
            page=page,
            limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


@router.get("/{scrapper_id}", response_model=ScrapperDetail)
def get_scraper(
    scrapper_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    scrapper = db.query(Scrapper).filter(Scrapper.id == scrapper_id).first()
    if not scrapper:
        raise HTTPException(status_code=404, detail="Scrapper not found")

    site_name = scrapper.site_source.name if scrapper.site_source else None

    offres_collectees = (
        db.query(func.count(OffreNormalisee.id))
        .filter(OffreNormalisee.scraper_id == scrapper_id)
        .scalar() or 0
    )
    duree = None
    if scrapper.date_debut and scrapper.date_fin:
        duree = int((scrapper.date_fin - scrapper.date_debut).total_seconds())

    cat_stats = (
        db.query(ScrapingCategoryStat)
        .filter(ScrapingCategoryStat.scrapper_id == scrapper_id)
        .order_by(ScrapingCategoryStat.page_number)
        .all()
    )

    return ScrapperDetail(
        id=scrapper.id,
        site_source_id=scrapper.site_source_id,
        site_name=site_name,
        statut=scrapper.statut,
        date_debut=scrapper.date_debut,
        date_fin=scrapper.date_fin,
        offres_collectees=offres_collectees,
        duree_secondes=duree,
        category_stats=[
            CategoryStatOut(
                category_url=s.category_url,
                products_found=s.products_found,
                page_number=s.page_number,
                duration_ms=s.duration_ms,
            )
            for s in cat_stats
        ],
    )


@router.post("/{scrapper_id}/retry")
def retry_scraper(
    scrapper_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    scrapper = db.query(Scrapper).filter(Scrapper.id == scrapper_id).first()
    if not scrapper:
        raise HTTPException(status_code=404, detail="Scrapper not found")

    site_source = (
        db.query(SiteSource).filter(SiteSource.id == scrapper.site_source_id).first()
    )
    if not site_source or not site_source.scraper_id:
        raise HTTPException(
            status_code=400,
            detail="Scrapper has no associated site_source with a scraper_id slug",
        )

    from src.scraper.tasks.pipeline import launch_pipeline
    task = launch_pipeline.delay(site_id=site_source.scraper_id)
    return {
        "task_id": task.id,
        "message": f"Pipeline relancé pour {site_source.scraper_id}",
    }


@router.post("/{scrapper_id}/cancel")
def cancel_scraper(
    scrapper_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    scrapper = db.query(Scrapper).filter(Scrapper.id == scrapper_id).first()
    if not scrapper:
        raise HTTPException(status_code=404, detail=f"Scrapper {scrapper_id} introuvable")
    if scrapper.statut not in ("EN_COURS",):
        raise HTTPException(
            status_code=400,
            detail=f"Scrapper {scrapper_id} ne peut pas être annulé (statut={scrapper.statut})",
        )
    scrapper.statut = "ANNULE"
    scrapper.date_fin = datetime.now(timezone.utc)
    db.commit()

    r = _get_redis()
    r.setex(f"scraper:cancelled:{scrapper_id}", 86400, "1")

    revoked = 0
    try:
        from src.worker.worker import celery_app
        inspector = celery_app.control.inspect(timeout=3)
        active_tasks = inspector.active() or {}
        reserved_tasks = inspector.reserved() or {}
        all_tasks = {}
        for worker, tasks in {**active_tasks, **reserved_tasks}.items():
            all_tasks.setdefault(worker, []).extend(tasks)
        for worker_name, tasks in all_tasks.items():
            for task in tasks:
                if task.get("kwargs", {}).get("scrapper_id") == scrapper_id:
                    celery_app.control.revoke(task["id"], terminate=True, signal="SIGTERM")
                    revoked += 1
    except Exception as e:
        logger.warning(f"Impossible d'inspecter les workers actifs: {e}")

    return {"scrapper_id": scrapper_id, "statut": "ANNULE", "tasks_terminated": revoked}
