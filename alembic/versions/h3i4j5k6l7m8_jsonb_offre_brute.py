"""jsonb_offre_brute

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'h3i4j5k6l7m8'
down_revision: Union[str, None] = 'g2h3i4j5k6l7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE offres_normalisees
        ALTER COLUMN offre_brute TYPE jsonb
        USING offre_brute::jsonb
    """)
    op.execute("""
        ALTER TABLE snapshots
        ALTER COLUMN offre_brute TYPE jsonb
        USING offre_brute::jsonb
    """)
    # GIN index for fast JSON key/value queries on offers
    op.execute("""
        CREATE INDEX ix_offres_brute_gin ON offres_normalisees USING gin (offre_brute)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_offres_brute_gin")
    op.execute("""
        ALTER TABLE offres_normalisees
        ALTER COLUMN offre_brute TYPE json
        USING offre_brute::json
    """)
    op.execute("""
        ALTER TABLE snapshots
        ALTER COLUMN offre_brute TYPE json
        USING offre_brute::json
    """)