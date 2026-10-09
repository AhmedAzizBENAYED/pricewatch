"""Integration tests against a real PostgreSQL + pgvector database.

Run with a throwaway database, e.g.:
    docker run -d --rm -p 55432:5432 -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
        -e POSTGRES_DB=pricewatch_test pgvector/pgvector:pg16
    TEST_DATABASE=1 POSTGRES_HOST=localhost POSTGRES_PORT=55432 POSTGRES_USER=test \
        POSTGRES_PASSWORD=test POSTGRES_DB=pricewatch_test pytest -m integration
"""

import os
from pathlib import Path

import pytest

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("TEST_DATABASE") != "1", reason="set TEST_DATABASE=1 to run database tests"),
]

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def migrated_db():
    """Apply every Alembic migration to the empty test database."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture
def db(migrated_db):
    """A session whose changes are always rolled back."""
    from src.common.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_migrations_produce_every_table_the_models_use(migrated_db):
    from sqlalchemy import inspect

    from src.common.database import engine
    from src.common.models import Base

    existing = set(inspect(engine).get_table_names())
    missing = set(Base.metadata.tables) - existing
    assert not missing, f"models reference tables that no migration creates: {sorted(missing)}"


def test_tenants_only_see_offers_in_their_assigned_categories(db):
    from src.api.deps import tenant_offers_query
    from src.common.models import Categorie, OffreNormalisee, Tenant, TenantCategorie

    phones, laptops, shared = Categorie(nom="Smartphones"), Categorie(nom="PC portables"), Categorie(nom="Accessoires")
    mytek, samsung, newcomer = (
        Tenant(nom_organisation="Mytek", profil_client="SITE_ECOMMERCE"),
        Tenant(nom_organisation="Samsung", profil_client="MARQUE"),
        Tenant(nom_organisation="No scope yet", profil_client="SITE_ECOMMERCE"),
    )
    db.add_all([phones, laptops, shared, mytek, samsung, newcomer])
    db.flush()

    db.add_all([
        TenantCategorie(tenant_id=mytek.id, categorie_id=laptops.id),
        TenantCategorie(tenant_id=mytek.id, categorie_id=shared.id),
        TenantCategorie(tenant_id=samsung.id, categorie_id=phones.id),
        TenantCategorie(tenant_id=samsung.id, categorie_id=shared.id),
    ])
    offers = {
        "phone": OffreNormalisee(nom="Galaxy S24", url_produit="https://t/phone", categorie_id=phones.id),
        "laptop": OffreNormalisee(nom="IdeaPad 3", url_produit="https://t/laptop", categorie_id=laptops.id),
        "cable": OffreNormalisee(nom="USB-C cable", url_produit="https://t/cable", categorie_id=shared.id),
        "uncategorized": OffreNormalisee(nom="Mystery item", url_produit="https://t/none", categorie_id=None),
    }
    db.add_all(offers.values())
    db.flush()

    def visible(tenant):
        return {o.nom for o in tenant_offers_query(db, tenant.id).all()}

    assert visible(mytek) == {"IdeaPad 3", "USB-C cable"}
    assert visible(samsung) == {"Galaxy S24", "USB-C cable"}
    assert visible(newcomer) == set()
