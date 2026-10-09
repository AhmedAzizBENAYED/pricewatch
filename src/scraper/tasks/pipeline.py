import asyncio
import logging
import os
import redis
import time
from collections import namedtuple
from datetime import datetime, timezone
from celery.exceptions import SoftTimeLimitExceeded
from src.worker.worker import celery_app
from src.common.db.session import get_db_session
from src.common.models.site_source import SiteSource
from src.common.models.scrapper import Scrapper
from src.common.models.offre import OffreNormalisee
from src.common.models.snapshot import Snapshot
from src.common.models.scraping_stat import ScrapingCategoryStat
from src.common.models.evenement import Evenement
from src.normalizer.pipeline import normalize_offer
from src.worker.tasks.alert_processor import process_alerts_for_event
import src.scraper as scraper_module

_SnapLike = namedtuple('_SnapLike', ['prix_original', 'prix_en_promotion', 'stock_status'])

logger = logging.getLogger(__name__)

# ── Redis helpers ────────────────────────────────────────────────────────────

_redis_clients: dict = {}


def _get_redis():
    pid = os.getpid()
    if pid not in _redis_clients:
        _redis_clients[pid] = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            db=0,
            decode_responses=True,
        )
    return _redis_clients[pid]


def _seen_key(scrapper_id: int) -> str:
    return f"scraper:seen:{scrapper_id}"


def _cancelled_key(scrapper_id: int) -> str:
    return f"scraper:cancelled:{scrapper_id}"


def _activity_key(scrapper_id: int) -> str:
    return f"scraper:activity:{scrapper_id}"


def _is_cancelled(scrapper_id: int) -> bool:
    return _get_redis().exists(_cancelled_key(scrapper_id)) == 1


def _is_url_new(scrapper_id: int, url: str) -> bool:
    """Returns True if URL is new (not yet queued). Marks it as seen atomically."""
    return _get_redis().sadd(_seen_key(scrapper_id), url) == 1


def _touch_activity(scrapper_id: int):
    """Record that a task just completed for this scrapper. Used by the watchdog."""
    _get_redis().set(
        _activity_key(scrapper_id),
        datetime.now(timezone.utc).timestamp(),
        ex=86400,
    )


# ── Event detection ──────────────────────────────────────────────────────────

def detect_and_create_event(db, offre_id: int, new_snapshot, prev_snapshot):
    if prev_snapshot is None:
        event_type = 'NOUVELLE_OFFRE_DECOUVERTE'
        valeur_avant = None
        valeur_apres = new_snapshot.prix_original
    elif (prev_snapshot.stock_status != 'RUPTURE'
          and new_snapshot.stock_status == 'RUPTURE'):
        event_type = 'RUPTURE_STOCK'
        valeur_avant = prev_snapshot.prix_original
        valeur_apres = new_snapshot.prix_original
    elif (prev_snapshot.stock_status == 'RUPTURE'
          and new_snapshot.stock_status != 'RUPTURE'):
        event_type = 'RETOUR_STOCK'
        valeur_avant = prev_snapshot.prix_original
        valeur_apres = new_snapshot.prix_original
    elif (not prev_snapshot.prix_en_promotion
          and new_snapshot.prix_en_promotion):
        event_type = 'DEBUT_PROMOTION'
        valeur_avant = prev_snapshot.prix_original
        valeur_apres = new_snapshot.prix_en_promotion
    elif (prev_snapshot.prix_original is not None
          and new_snapshot.prix_original is not None):
        diff = float(new_snapshot.prix_original) - float(prev_snapshot.prix_original)
        pct = diff / float(prev_snapshot.prix_original)
        if pct <= -0.02:
            event_type = 'BAISSE_PRIX'
            valeur_avant = prev_snapshot.prix_original
            valeur_apres = new_snapshot.prix_original
        elif pct >= 0.02:
            event_type = 'HAUSSE_PRIX'
            valeur_avant = prev_snapshot.prix_original
            valeur_apres = new_snapshot.prix_original
        else:
            return
    else:
        return

    event = Evenement(
        offre_id=offre_id,
        type_evenement=event_type,
        valeur_avant=valeur_avant,
        valeur_apres=valeur_apres,
        date_detection=datetime.now(timezone.utc),
    )
    db.add(event)
    db.flush()
    try:
        process_alerts_for_event(db, event)
    except Exception as e:
        logger.warning(f"[ALERT] Erreur traitement alertes pour event {event.id}: {e}")


# ── Snapshot helpers ─────────────────────────────────────────────────────────

def _prices_equal(a, b) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return round(float(a), 2) == round(float(b), 2)


def _snapshot_is_changed(snap: Snapshot, raw) -> bool:
    return (
        not _prices_equal(snap.prix_original, raw.prix_original)
        or not _prices_equal(snap.prix_en_promotion, raw.prix_en_promotion)
        or not _prices_equal(snap.prix_unitaire, raw.prix_unitaire)
        or snap.stock_status != raw.statut_stock
    )


# ── DB helpers ───────────────────────────────────────────────────────────────

def _build_scraper(site_id: str, base_url: str, scrapper_db_id: int):
    scraper_class = scraper_module.get_scraper_class(site_id)
    return scraper_class(site_id=site_id, base_url=base_url, scrapper_db_id=scrapper_db_id)


def _mark_scrapper(scrapper_id: int, statut: str):
    try:
        with get_db_session() as db:
            s = db.query(Scrapper).filter(Scrapper.id == scrapper_id).first()
            if s:
                s.statut = statut
                if statut in ("TERMINE", "ECHOUE", "ANNULE"):
                    s.date_fin = datetime.now(timezone.utc)
        if statut in ("TERMINE", "ECHOUE", "ANNULE"):
            r = _get_redis()
            r.delete(_seen_key(scrapper_id))
            r.delete(_cancelled_key(scrapper_id))
            r.delete(_activity_key(scrapper_id))
    except Exception as e:
        logger.error(f"Impossible de mettre à jour Scrapper {scrapper_id}: {e}")


# ── Watchdog ─────────────────────────────────────────────────────────────────

@celery_app.task(name="scraping.watchdog")
def scraper_watchdog():
    with get_db_session() as db:
        active_scrappers = db.query(Scrapper).filter(
            Scrapper.statut == "EN_COURS"
        ).all()
        # Extract plain data INSIDE the session while the instance is still bound
        active_scrapper_data = [
            {"id": s.id, "date_debut": s.date_debut}
            for s in active_scrappers
        ]

    if not active_scrapper_data:
        return

    r = _get_redis()
    products_len = int(r.llen("products") or 0)
    categories_len = int(r.llen("categories") or 0)

    if products_len > 0 or categories_len > 0:
        logger.debug(
            f"[WATCHDOG] Queues non vides — products={products_len} categories={categories_len}"
        )
        return

    now = datetime.now(timezone.utc).timestamp()

    for scrapper in active_scrapper_data:   # now just plain dicts
        if _is_cancelled(scrapper["id"]):
            continue

        last_ts = r.get(_activity_key(scrapper["id"]))

        if last_ts is None:
            age = (
                datetime.now(timezone.utc)
                - scrapper["date_debut"].replace(tzinfo=timezone.utc)
            ).total_seconds()
            if age < 120:
                logger.debug(f"[WATCHDOG] Scrapper {scrapper['id']} trop récent ({age:.0f}s), skip")
                continue
            logger.warning(
                f"[WATCHDOG] Scrapper {scrapper['id']} bloqué sans activité ({age:.0f}s) → ECHOUE"
            )
            _mark_scrapper(scrapper["id"], "ECHOUE")
        else:
            idle_seconds = now - float(last_ts)
            if idle_seconds >= 60:
                logger.info(
                    f"[WATCHDOG] Scrapper {scrapper['id']} terminé "
                    f"(queues vides + idle={idle_seconds:.0f}s) → TERMINE"
                )
                _mark_scrapper(scrapper["id"], "TERMINE")
            else:
                logger.debug(
                    f"[WATCHDOG] Scrapper {scrapper['id']} idle={idle_seconds:.0f}s, attente..."
                )


# ── Scraping tasks ────────────────────────────────────────────────────────────

@celery_app.task(name="scraping.launch_pipeline", bind=True, max_retries=0)
def launch_pipeline(self, site_id: str):
    logger.info(f"[PIPELINE] Lancement site_id='{site_id}'")
    with get_db_session() as db:
        site = db.query(SiteSource).filter(
            SiteSource.scraper_id == site_id,
            SiteSource.est_actif == True,
        ).first()
        if not site:
            logger.error(f"Site '{site_id}' non trouvé ou inactif")
            return
        base_url = site.url
        scrapper = Scrapper(
            site_source_id=site.id,
            date_debut=datetime.now(timezone.utc),
            statut="EN_COURS",
        )
        db.add(scrapper)
        db.flush()
        scrapper_id = scrapper.id

    logger.info(f"[PIPELINE] Scrapper créé id={scrapper_id}")
    scrape_homepage_task.delay(site_id=site_id, scrapper_id=scrapper_id, base_url=base_url)


@celery_app.task(name="scraping.scrape_homepage", bind=True, max_retries=3, default_retry_delay=60)
def scrape_homepage_task(self, site_id: str, scrapper_id: int, base_url: str):
    logger.info(f"[HOMEPAGE] site='{site_id}' scrapper={scrapper_id}")
    try:
        scraper = _build_scraper(site_id, base_url, scrapper_id)
        category_urls = asyncio.run(scraper.scrape_homepage())
        logger.info(f"[HOMEPAGE] {len(category_urls)} catégories")

        if not category_urls:
            _mark_scrapper(scrapper_id, "TERMINE")
            return

        for cat in category_urls:
            scrape_category_task.delay(
                site_id=site_id,
                scrapper_id=scrapper_id,
                base_url=base_url,
                category_url=cat.url,
                category_name=cat.name,
            )

        _touch_activity(scrapper_id)

    except Exception as exc:
        logger.error(f"[HOMEPAGE] Erreur: {exc}", exc_info=True)
        if self.request.retries >= self.max_retries:
            _mark_scrapper(scrapper_id, "ECHOUE")
        raise self.retry(exc=exc)


@celery_app.task(
    name="scraping.scrape_category",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="categories",
    time_limit=180,
    soft_time_limit=150,
)
def scrape_category_task(
    self,
    site_id: str,
    scrapper_id: int,
    base_url: str,
    category_url: str,
    category_name: str,
):
    logger.info(f"[CATEGORY] '{category_name}' scrapper={scrapper_id}")

    if _is_cancelled(scrapper_id):
        logger.info(f"[CATEGORY] Annulé — abandon '{category_name}'")
        return

    # Derive page number from URL (?page=N or ?p=N)
    import re as _re
    _page_match = _re.search(r'[?&](?:page|p)=(\d+)', category_url)
    page_number = int(_page_match.group(1)) if _page_match else 1

    t0 = time.monotonic()
    try:
        scraper = _build_scraper(site_id, base_url, scrapper_id)
        result = asyncio.run(scraper.scrape_category(category_url))
        duration_ms = (time.monotonic() - t0) * 1000

        n_products = len(result.products)
        logger.info(f"[CATEGORY] '{category_name}' page={page_number} → {n_products} produits")

        if n_products == 0:
            logger.warning(
                f"[CATEGORY] 0 produits — site={site_id} url={category_url} page={page_number}"
            )

        # ── Persist stat ──────────────────────────────────────────────────
        try:
            with get_db_session() as db:
                db.add(ScrapingCategoryStat(
                    scrapper_id=scrapper_id,
                    site_id=site_id,
                    category_url=category_url,
                    page_number=page_number,
                    products_found=n_products,
                    has_next_page=1 if result.next_url else 0,
                    duration_ms=round(duration_ms, 1),
                ))
        except Exception as stat_err:
            logger.warning(f"[CATEGORY] Impossible d'écrire les stats: {stat_err}")

        for prod in result.products:
            if not _is_url_new(scrapper_id, prod.url):
                logger.debug(f"[CATEGORY] Doublon ignoré: {prod.url}")
                continue
            scrape_product_task.delay(
                site_id=site_id,
                scrapper_id=scrapper_id,
                base_url=base_url,
                product_url=prod.url,
                category_url=category_url,
                category_image_url=prod.image_url,
                category_stock_status=prod.stock_status,
            )

        if result.next_url:
            logger.info(f"[CATEGORY] Page suivante: {result.next_url}")
            scrape_category_task.delay(
                site_id=site_id,
                scrapper_id=scrapper_id,
                base_url=base_url,
                category_url=result.next_url,
                category_name=category_name,
            )

        _touch_activity(scrapper_id)

    except SoftTimeLimitExceeded as exc:
        logger.warning(f"[CATEGORY] Timeout '{category_url}' page={page_number} (tentative {self.request.retries + 1})")
        _touch_activity(scrapper_id)
        raise self.retry(exc=exc)
    except Exception as exc:
        logger.error(f"[CATEGORY] Erreur '{category_url}': {exc}", exc_info=True)
        _touch_activity(scrapper_id)
        raise self.retry(exc=exc)


@celery_app.task(
    name="scraping.scrape_product",
    bind=True,
    max_retries=3,
    time_limit=180,
    soft_time_limit=150,
    default_retry_delay=15,
    queue="products",
)
def scrape_product_task(
    self,
    site_id: str,
    scrapper_id: int,
    base_url: str,
    product_url: str,
    category_url: str,
    category_image_url: str = None,
    category_stock_status: str = None,
):
    logger.info(f"[PRODUCT] scrapper={scrapper_id} | {product_url}")

    if _is_cancelled(scrapper_id):
        logger.info(f"[PRODUCT] Annulé — abandon {product_url}")
        return

    try:
        scraper = _build_scraper(site_id, base_url, scrapper_id)
        raw_offer = asyncio.run(scraper.scrape_product(
            product_url,
            category_url,
            override_image_url=category_image_url,
            override_stock_status=category_stock_status,
        ))

        with get_db_session() as db:
            existing = db.query(OffreNormalisee).filter(
                OffreNormalisee.url_produit == raw_offer.product_url
            ).first()

            if existing:
                # Existing offer — update price/stock/content only; do not re-normalize.
                existing.nom = raw_offer.nom
                existing.prix_original = raw_offer.prix_original
                existing.prix_en_promotion = raw_offer.prix_en_promotion
                existing.prix_unitaire = raw_offer.prix_unitaire
                existing.est_en_promotion = raw_offer.est_en_promotion
                existing.statut_stock = raw_offer.statut_stock
                existing.image = raw_offer.image_url
                existing.description = raw_offer.description
                existing.offre_brute = raw_offer.offre_brute
                existing.scraper_id = scrapper_id
                offre_id = existing.id
                logger.info(
                    f"[PRODUCT] Mis à jour: '{raw_offer.nom}' | "
                    f"{raw_offer.prix_original} TND | {raw_offer.statut_stock}"
                )
            else:
                # New offer — insert and normalize immediately.
                new_offre = OffreNormalisee(
                    nom=raw_offer.nom,
                    prix_original=raw_offer.prix_original,
                    prix_en_promotion=raw_offer.prix_en_promotion,
                    prix_unitaire=raw_offer.prix_unitaire,
                    est_en_promotion=raw_offer.est_en_promotion,
                    statut_stock=raw_offer.statut_stock,
                    url_produit=raw_offer.product_url,
                    image=raw_offer.image_url,
                    description=raw_offer.description,
                    offre_brute=raw_offer.offre_brute,
                    scraper_id=scrapper_id,
                    est_offre_principale=False,
                )
                db.add(new_offre)
                db.flush()
                offre_id = new_offre.id
                try:
                    normalize_offer(db, new_offre, site_id)
                except Exception as norm_err:
                    logger.warning(f"[PRODUCT] Normalisation échouée pour offre_id={offre_id}: {norm_err}")
                logger.info(
                    f"[PRODUCT] Stocké+normalisé: '{raw_offer.nom}' | "
                    f"{raw_offer.prix_original} TND | {raw_offer.statut_stock}"
                )

            # ── Snapshot logic ────────────────────────────────────────────
            now = datetime.now(timezone.utc)
            open_snap = db.query(Snapshot).filter(
                Snapshot.offre_id == offre_id,
                Snapshot.date_fin_observation == None,
            ).with_for_update().first()

            new_snap_like = _SnapLike(
                prix_original=raw_offer.prix_original,
                prix_en_promotion=raw_offer.prix_en_promotion,
                stock_status=raw_offer.statut_stock,
            )

            if open_snap is None:
                db.add(Snapshot(
                    offre_id=offre_id,
                    prix_original=raw_offer.prix_original,
                    prix_en_promotion=raw_offer.prix_en_promotion,
                    prix_unitaire=raw_offer.prix_unitaire,
                    stock_status=raw_offer.statut_stock,
                    offre_brute=raw_offer.offre_brute,
                    date_debut_observation=now,
                    nb_observations_identiques=1,
                ))
                db.flush()
                logger.info(f"[SNAPSHOT] Nouveau snapshot créé pour offre_id={offre_id}")
                detect_and_create_event(db, offre_id, new_snap_like, None)

            elif _snapshot_is_changed(open_snap, raw_offer):
                prev_snap_like = _SnapLike(
                    prix_original=open_snap.prix_original,
                    prix_en_promotion=open_snap.prix_en_promotion,
                    stock_status=open_snap.stock_status,
                )
                open_snap.date_fin_observation = now
                db.add(Snapshot(
                    offre_id=offre_id,
                    prix_original=raw_offer.prix_original,
                    prix_en_promotion=raw_offer.prix_en_promotion,
                    prix_unitaire=raw_offer.prix_unitaire,
                    stock_status=raw_offer.statut_stock,
                    offre_brute=raw_offer.offre_brute,
                    date_debut_observation=now,
                    nb_observations_identiques=1,
                ))
                db.flush()
                logger.info(
                    f"[SNAPSHOT] Changement détecté pour offre_id={offre_id} — "
                    f"ancien prix={open_snap.prix_original} stock={open_snap.stock_status} → "
                    f"nouveau prix={raw_offer.prix_original} stock={raw_offer.statut_stock}"
                )
                detect_and_create_event(db, offre_id, new_snap_like, prev_snap_like)
            else:
                open_snap.nb_observations_identiques += 1
                logger.debug(
                    f"[SNAPSHOT] Pas de changement offre_id={offre_id} "
                    f"(nb_obs={open_snap.nb_observations_identiques})"
                )

        _touch_activity(scrapper_id)

    except SoftTimeLimitExceeded as exc:
        logger.warning(f"[PRODUCT] Timeout '{product_url}' (tentative {self.request.retries + 1})")
        _touch_activity(scrapper_id)
        raise self.retry(exc=exc)
    except Exception as exc:
        logger.error(f"[PRODUCT] Erreur '{product_url}': {exc}", exc_info=True)
        _touch_activity(scrapper_id)
        raise self.retry(exc=exc)