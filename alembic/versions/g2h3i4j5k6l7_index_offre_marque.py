"""index_offre_marque

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'g2h3i4j5k6l7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Speeds up the normalizer query: WHERE marque IS NULL AND scraper_id = X
    op.create_index(
        'ix_offres_scraper_marque',
        'offres_normalisees',
        ['scraper_id', 'marque'],
    )


def downgrade() -> None:
    op.drop_index('ix_offres_scraper_marque', table_name='offres_normalisees')