import logging
from src.normalizer.spec_normalizer import SpecNormalizer
from src.normalizer.brand_extractor import BrandExtractor
from src.normalizer.category_assigner import assign_category

logger = logging.getLogger(__name__)


def normalize_offer(db, offer, site_id: str) -> None:
    """
    Normalize a single OffreNormalisee in-place.

    Populates specs_normalises, marque (if missing), and categorie_id (if missing).
    The caller owns the session and must commit when ready.
    """
    offre_brute = offer.offre_brute or {}
    fiche = offre_brute.get("fiche_technique", {})
    if not isinstance(fiche, dict):
        fiche = {}
    category_url = offre_brute.get("category_url", "")

    spec_norm = SpecNormalizer.from_db(db)
    brand_ext = BrandExtractor.from_db(db)

    specs = spec_norm.normalize(site_id, fiche, offer.nom or "", offer.marque)
    if specs:
        offer.specs_normalises = specs
        logger.debug(f"[NORMALIZE] {len(specs)} specs pour offre_id={offer.id}")

    if not offer.marque:
        marque = brand_ext.extract(fiche, offer.nom or "")
        if marque:
            offer.marque = marque
            logger.debug(f"[NORMALIZE] marque='{marque}' pour offre_id={offer.id}")

    if not offer.categorie_id:
        cat_id = assign_category(db, site_id, category_url)
        if cat_id:
            offer.categorie_id = cat_id
            logger.debug(f"[NORMALIZE] categorie_id={cat_id} pour offre_id={offer.id}")
