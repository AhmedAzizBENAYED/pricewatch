import logging
from sqlalchemy import text
from src.worker.worker import celery_app
from src.common.db.session import get_db_session
from src.common.models.offre import OffreNormalisee
from src.normalizer.spec_normalizer import SpecNormalizer
from src.normalizer.brand_extractor import BrandExtractor
from src.normalizer.category_assigner import assign_category
from src.normalizer.pipeline import normalize_offer

logger = logging.getLogger(__name__)

_BATCH_SIZE = 200


@celery_app.task(name="normalize.offer", queue="celery")
def normalize_offer_task(offre_id: int) -> dict:
    """Normalize a single offer (specs, brand, category)."""
    with get_db_session() as db:
        offer = db.query(OffreNormalisee).filter(OffreNormalisee.id == offre_id).first()
        if not offer:
            logger.warning(f"[NORMALIZE] Offre {offre_id} introuvable")
            return {"status": "not_found", "offre_id": offre_id}

        row = db.execute(text("""
            SELECT ss.scraper_id AS site_id
            FROM scrappeurs s
            JOIN sites_source ss ON ss.id = s.site_source_id
            WHERE s.id = :sid
        """), {"sid": offer.scraper_id}).fetchone()

        if not row:
            logger.warning(f"[NORMALIZE] site_id introuvable pour scraper_id={offer.scraper_id}")
            return {"status": "no_site", "offre_id": offre_id}

        normalize_offer(db, offer, row.site_id)

    return {"status": "ok", "offre_id": offre_id}


@celery_app.task(
    name="normalize.batch",
    queue="celery",
    time_limit=3600,
    soft_time_limit=3500,
)
def batch_normalize_task(site_id: str | None = None) -> dict:
    """
    Normalize all offers that are missing specs, brand, or category.
    Optionally restricted to a single site. Commits every BATCH_SIZE records.
    """
    site_filter = "AND ss.scraper_id = :site" if site_id else ""
    params = {"site": site_id} if site_id else {}

    with get_db_session() as db:
        rows = db.execute(text(f"""
            SELECT o.id, ss.scraper_id AS site_id
            FROM offres_normalisees o
            JOIN scrappeurs s    ON s.id = o.scraper_id
            JOIN sites_source ss ON ss.id = s.site_source_id
            WHERE (o.specs_normalises IS NULL OR o.marque IS NULL OR o.categorie_id IS NULL)
              AND o.offre_brute IS NOT NULL
              {site_filter}
            ORDER BY o.id
        """), params).fetchall()

    total = len(rows)
    logger.info(f"[BATCH NORMALIZE] {total} offres à normaliser (site={site_id or 'tous'})")

    updated = 0
    errors = 0

    for batch_start in range(0, total, _BATCH_SIZE):
        batch = rows[batch_start: batch_start + _BATCH_SIZE]
        with get_db_session() as db:
            spec_norm = SpecNormalizer.from_db(db)
            brand_ext = BrandExtractor.from_db(db)

            for row in batch:
                try:
                    offer = db.query(OffreNormalisee).filter(OffreNormalisee.id == row.id).first()
                    if not offer:
                        continue

                    offre_brute = offer.offre_brute or {}
                    fiche = offre_brute.get("fiche_technique", {})
                    if not isinstance(fiche, dict):
                        fiche = {}
                    category_url = offre_brute.get("category_url", "")

                    if not offer.specs_normalises:
                        specs = spec_norm.normalize(row.site_id, fiche, offer.nom or "", offer.marque)
                        if specs:
                            offer.specs_normalises = specs

                    if not offer.marque:
                        marque = brand_ext.extract(fiche, offer.nom or "")
                        if marque:
                            offer.marque = marque

                    if not offer.categorie_id:
                        cat_id = assign_category(db, row.site_id, category_url)
                        if cat_id:
                            offer.categorie_id = cat_id

                    updated += 1

                except Exception as e:
                    logger.error(f"[BATCH NORMALIZE] Erreur offre {row.id}: {e}")
                    errors += 1

        logger.info(
            f"[BATCH NORMALIZE] {min(batch_start + _BATCH_SIZE, total)}/{total} "
            f"traitées — {updated} ok, {errors} erreurs"
        )

    logger.info(f"[BATCH NORMALIZE] Terminé — {updated}/{total} normalisées, {errors} erreurs")
    return {"total": total, "updated": updated, "errors": errors}


@celery_app.task(
    name="normalize.batch_match",
    queue="celery",
    time_limit=7200,
    soft_time_limit=7100,
)
def batch_match_task(site_id: str, use_llm: bool = False) -> dict:
    """
    Run the referentiel matching pipeline for a site.
    Delegates to the match_informatique script logic.
    """
    import subprocess
    import sys

    cmd = [sys.executable, "scripts/match_informatique.py", "--site", site_id, "--write-db"]
    if use_llm:
        cmd.append("--llm")

    logger.info(f"[BATCH MATCH] Lancement: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=7000)
        stdout = result.stdout[-4000:] if len(result.stdout) > 4000 else result.stdout
        if result.returncode != 0:
            logger.error(f"[BATCH MATCH] Échec (code={result.returncode}):\n{result.stderr[-2000:]}")
            return {"status": "error", "returncode": result.returncode, "stderr": result.stderr[-1000:]}
        logger.info(f"[BATCH MATCH] Terminé:\n{stdout}")
        return {"status": "ok", "site_id": site_id, "use_llm": use_llm}
    except subprocess.TimeoutExpired:
        logger.error("[BATCH MATCH] Timeout atteint")
        return {"status": "timeout"}
    except Exception as e:
        logger.error(f"[BATCH MATCH] Erreur: {e}")
        return {"status": "error", "message": str(e)}
