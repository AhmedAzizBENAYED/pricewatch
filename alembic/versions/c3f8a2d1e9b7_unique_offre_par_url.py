"""unique_offre_par_url

Revision ID: c3f8a2d1e9b7
Revises: 5acbf4d4c215
Create Date: 2026-04-11 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c3f8a2d1e9b7'
down_revision: Union[str, None] = '5acbf4d4c215'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove duplicates: keep only the row with the highest id per url_produit
    op.execute("""
        DELETE FROM offres_normalisees
        WHERE id NOT IN (
            SELECT MAX(id) FROM offres_normalisees GROUP BY url_produit
        )
    """)
    op.drop_constraint('uq_offre_url_scraper', 'offres_normalisees', type_='unique')
    op.create_unique_constraint('uq_offre_url', 'offres_normalisees', ['url_produit'])


def downgrade() -> None:
    op.drop_constraint('uq_offre_url', 'offres_normalisees', type_='unique')
    op.create_unique_constraint('uq_offre_url_scraper', 'offres_normalisees', ['url_produit', 'scraper_id'])