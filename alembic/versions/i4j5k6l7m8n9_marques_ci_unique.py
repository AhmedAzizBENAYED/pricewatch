"""marques_ci_unique

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'i4j5k6l7m8n9'
down_revision: Union[str, None] = 'h3i4j5k6l7m8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove case-insensitive duplicates — keep the row with the lowest id
    op.execute("""
        DELETE FROM marques
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM marques
            GROUP BY lower(nom)
        )
    """)

    # Drop the old case-sensitive unique constraint
    op.execute("ALTER TABLE marques DROP CONSTRAINT IF EXISTS uq_marque_nom")

    # Replace with a case-insensitive unique index
    op.execute("CREATE UNIQUE INDEX uq_marque_nom_ci ON marques (lower(nom))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_marque_nom_ci")
    op.execute("""
        ALTER TABLE marques ADD CONSTRAINT uq_marque_nom UNIQUE (nom)
    """)