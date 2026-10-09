import logging
from typing import List
from src.scraper.base.base_scraper import BaseScraper
from src.scraper.base.models import CategoryUrl, ProductUrl, CategoryPageResult

logger = logging.getLogger(__name__)


class CarrefourScraper(BaseScraper):
    """
    Scraper for Carrefour (carrefour.tn).
    Categories are discovered by opening the sidebar navigation.
    Each category page handles its own click-based pagination internally.
    """

    async def scrape_homepage(self) -> List[CategoryUrl]:
        logger.info(f"[CARREFOUR] Découverte des catégories: {self.base_url}")
        categories = await self.client.scrape_homepage(self.base_url, site_id=self.site_id)
        logger.info(f"[CARREFOUR] {len(categories)} catégories trouvées")
        return [
            CategoryUrl(url=c["url"], name=c["name"], site_id=self.site_id)
            for c in categories
        ]

    async def scrape_category(self, category_url: str) -> CategoryPageResult:
        logger.info(f"[CARREFOUR] Catégorie: {category_url}")
        data = await self.client.scrape_category(category_url, site_id=self.site_id)
        products = [
            ProductUrl(url=url, category_url=category_url, site_id=self.site_id)
            for url in data.get("products", [])
        ]
        logger.info(f"[CARREFOUR] {len(products)} produits trouvés")
        return CategoryPageResult(products=products, next_url=data.get("next_url"))