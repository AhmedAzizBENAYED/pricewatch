import logging
from typing import List

from src.scraper.base.base_scraper import BaseScraper
from src.scraper.base.models import CategoryUrl, ProductUrl, CategoryPageResult

logger = logging.getLogger(__name__)


class TunisianetScraper(BaseScraper):

    async def scrape_homepage(self) -> List[CategoryUrl]:
        categories = await self.client.scrape_homepage(self.base_url, site_id=self.site_id)
        logger.info(f"[TUNISIANET] {len(categories)} catégories trouvées")

        return [
            CategoryUrl(
                url=c["url"],
                name=c["name"],
                site_id=self.site_id,
            )
            for c in categories
        ]

    async def scrape_category(self, category_url: str) -> CategoryPageResult:
        logger.info(f"[TUNISIANET] Catégorie page : {category_url}")
        data = await self.client.scrape_category(category_url, site_id=self.site_id)

        products = [
            ProductUrl(url=url, category_url=category_url, site_id=self.site_id)
            for url in data.get("products", [])
        ]

        logger.info(f"[TUNISIANET] Produits trouvés : {len(products)}")
        return CategoryPageResult(
            products=products,
            next_url=data.get("next_url")
        )
