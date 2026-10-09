import logging
from typing import List
from src.scraper.base.base_scraper import BaseScraper
from src.scraper.base.models import CategoryUrl, ProductUrl, CategoryPageResult

logger = logging.getLogger(__name__)


class GeantScraper(BaseScraper):
    """
    Scraper for Géant Drive (geantdrive.tn).
    site_id format: "geant-{store}" e.g. "geant-tunis-city".
    base_url format: "https://www.geantdrive.tn/{store}".
    Categories are discovered at {base_url}/content/6-nos-rayons.
    """

    async def scrape_homepage(self) -> List[CategoryUrl]:
        categories_url = f"{self.base_url}/content/6-nos-rayons"
        logger.info(f"[{self.site_id.upper()}] Homepage categories: {categories_url}")
        categories = await self.client.scrape_homepage(categories_url, site_id=self.site_id)
        logger.info(f"[{self.site_id.upper()}] {len(categories)} catégories trouvées")
        return [
            CategoryUrl(url=c["url"], name=c["name"], site_id=self.site_id)
            for c in categories
        ]

    async def scrape_category(self, category_url: str) -> CategoryPageResult:
        logger.info(f"[{self.site_id.upper()}] Catégorie: {category_url}")
        data = await self.client.scrape_category(category_url, site_id=self.site_id)
        products = [
            ProductUrl(url=url, category_url=category_url, site_id=self.site_id)
            for url in data.get("products", [])
        ]
        logger.info(f"[{self.site_id.upper()}] {len(products)} produits trouvés")
        return CategoryPageResult(products=products, next_url=data.get("next_url"))