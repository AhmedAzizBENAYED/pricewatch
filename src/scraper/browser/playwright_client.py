import httpx
import logging
import os

logger = logging.getLogger(__name__)

PLAYWRIGHT_SERVICE_URL = os.getenv("PLAYWRIGHT_SERVICE_URL", "http://playwright:3001")


class PlaywrightClient:

    def __init__(self, timeout: int = 120):
        self.timeout = timeout

    async def _post(self, endpoint: str, payload: dict) -> dict:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=5.0)
        ) as client:
            response = await client.post(
                f"{PLAYWRIGHT_SERVICE_URL}{endpoint}",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            if data.get("status") == "failed":
                raise ValueError(f"Playwright error: {data.get('error')}")

            return data

    async def scrape_homepage(self, url: str, site_id: str) -> list:
        """Retourne liste de {url, name}"""
        data = await self._post(
            "/scrape/homepage",
            {
                "url": url,
                "site_id": site_id,
            },
        )
        return data.get("categories", [])

    async def scrape_category(self, url: str, site_id: str) -> dict:
        """Retourne {products: [url,...], next_url: str|null}"""
        data = await self._post(
            "/scrape/category",
            {
                "url": url,
                "site_id": site_id,
            },
        )
        return {
            "products": data.get("products", []),
            "next_url": data.get("next_url"),
        }

    async def scrape_product(self, url: str, site_id: str) -> dict:
        """Retourne toutes les données du produit"""
        return await self._post(
            "/scrape/product",
            {
                "url": url,
                "site_id": site_id,
            },
        )