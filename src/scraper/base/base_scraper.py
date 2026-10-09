import logging
from abc import ABC, abstractmethod
from typing import List
from .models import CategoryUrl, RawOffer, CategoryPageResult
from src.scraper.browser.playwright_client import PlaywrightClient

logger = logging.getLogger(__name__)


class BaseScraper(ABC):

    def __init__(self, site_id: str, base_url: str, scrapper_db_id: int):
        self.site_id = site_id
        self.base_url = base_url
        self.scrapper_db_id = scrapper_db_id
        self.client = PlaywrightClient()

    @abstractmethod
    async def scrape_homepage(self) -> List[CategoryUrl]: ...

    @abstractmethod
    async def scrape_category(self, category_url: str) -> CategoryPageResult: ...

    async def scrape_product(
        self,
        product_url: str,
        category_url: str,
        override_image_url: str = None,
        override_stock_status: str = None,
    ) -> RawOffer:
        logger.info(f"[{self.site_id.upper()}] Produit : {product_url}")
        data = await self.client.scrape_product(product_url, site_id=self.site_id)

        est_promo    = data.get("est_en_promotion", False)
        image_url    = override_image_url or data.get("image_url") or data.get("image")
        statut_stock = override_stock_status or data.get("statut_stock", "UNKNOWN")

        prix_original    = data.get("prix_original")
        prix_en_promotion = data.get("prix_en_promotion")
        prix_unitaire    = data.get("prix_unitaire")

        return RawOffer(
            site_id=self.site_id,
            product_url=product_url,
            category_url=category_url,
            nom=data.get("nom"),
            prix_original=prix_original,
            prix_en_promotion=prix_en_promotion,
            prix_unitaire=prix_unitaire,
            devise="TND",
            est_en_promotion=est_promo,
            statut_stock=statut_stock,
            image_url=image_url,
            description=data.get("description"),
            offre_brute={
                "nom": data.get("nom"),
                "prix_original": prix_original,
                "prix_en_promotion": prix_en_promotion,
                "prix_unitaire": prix_unitaire,
                "statut_stock": statut_stock,
                "image_url": image_url,
                "description": data.get("description"),
                "fiche_technique": data.get("fiche_technique", {}),
                "product_url": product_url,
                "category_url": category_url,
                "site_id": self.site_id,
            },
        )