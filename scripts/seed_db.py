import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.common.db.session import get_db_session
from src.common.models.site_source import SiteSource

SITES = [
    {"name": "Spacenet",            "url": "https://www.spacenet.tn/",                  "scraper_id": "spacenet",            "est_actif": True},
    {"name": "Mytek",               "url": "https://www.mytek.tn/",                     "scraper_id": "mytek",               "est_actif": True},
    {"name": "Tunisianet",          "url": "https://www.tunisianet.com.tn/",             "scraper_id": "tunisianet",          "est_actif": True},
    {"name": "Carrefour",           "url": "https://www.carrefour.tn/",                 "scraper_id": "carrefour",           "est_actif": True},
    {"name": "Aziza",               "url": "https://www.aziza.tn/",                     "scraper_id": "aziza",               "est_actif": True},
    {"name": "Géant Tunis City",    "url": "https://www.geantdrive.tn/tunis-city",       "scraper_id": "geant-tunis-city",    "est_actif": True},
    {"name": "Géant Azur City",     "url": "https://www.geantdrive.tn/azur-city",        "scraper_id": "geant-azur-city",     "est_actif": True},
    {"name": "Géant Bourgo Mall",   "url": "https://www.geantdrive.tn/bourgo-mall",      "scraper_id": "geant-bourgo-mall",   "est_actif": True},
    {"name": "Géant Sfax",          "url": "https://www.geantdrive.tn/sfax",             "scraper_id": "geant-sfax",          "est_actif": True},
]

def seed_sites():
    with get_db_session() as session:
        for site_data in SITES:
            existing = session.query(SiteSource).filter(
                SiteSource.scraper_id == site_data["scraper_id"]
            ).first()
            if not existing:
                print(f"Ajout du site: {site_data['name']}")
                session.add(SiteSource(**site_data))
            else:
                print(f"Site déjà présent: {site_data['name']}")

if __name__ == "__main__":
    seed_sites()
