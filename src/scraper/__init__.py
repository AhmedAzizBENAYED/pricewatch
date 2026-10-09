def get_scraper_class(site_id: str):
    if site_id == "mytek":
        from .sites.mytek.scraper import MytekScraper
        return MytekScraper

    if site_id == "spacenet":
        from .sites.spacenet.scraper import SpacenetScraper
        return SpacenetScraper
    if site_id == "tunisianet":
        from .sites.tunisianet.scraper import TunisianetScraper
        return TunisianetScraper

    if site_id == "carrefour":
        from .sites.carrefour.scraper import CarrefourScraper
        return CarrefourScraper

    if site_id == "aziza":
        from .sites.aziza.scraper import AzizaScraper
        return AzizaScraper

    if site_id.startswith("geant-"):
        from .sites.geant.scraper import GeantScraper
        return GeantScraper

    raise ValueError(f"Aucun scraper défini pour site_id={site_id}")