import logging
from typing import List
from src.scraper.base.base_scraper import BaseScraper
from src.scraper.base.models import CategoryUrl, ProductUrl, CategoryPageResult

logger = logging.getLogger(__name__)


class AzizaScraper(BaseScraper):
    """
    Scraper for Aziza (aziza.tn).
    Aziza has no category hierarchy — the homepage itself is the single "category"
    page. The JS parser scrolls to lazy-load all products and returns their URLs.
    """

    async def scrape_homepage(self) -> List[CategoryUrl]:
        logger.info(f"[AZIZA] Homepage = single category: {self.base_url}")
        return [CategoryUrl(url=self.base_url, name="Aziza", site_id=self.site_id)]

    async def scrape_category(self, category_url: str) -> CategoryPageResult:
        logger.info(f"[AZIZA] Scraping page: {category_url}")
        data = await self.client.scrape_category(category_url, site_id=self.site_id)
        products = [
            ProductUrl(url=url, category_url=category_url, site_id=self.site_id)
            for url in data.get("products", [])
        ]
        logger.info(f"[AZIZA] {len(products)} produits trouvés")
        return CategoryPageResult(products=products, next_url=None)