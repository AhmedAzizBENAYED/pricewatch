"""urls_par_site_jsonb

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-04-20 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'm8n9o0p1q2r3'
down_revision: Union[str, None] = 'l7m8n9o0p1q2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # All rows have url_categorie_brute = NULL, so no data migration needed.
    op.alter_column(
        'categories',
        'url_categorie_brute',
        new_column_name='urls_par_site',
        type_=JSONB,
        postgresql_using='NULL::jsonb',
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'categories',
        'urls_par_site',
        new_column_name='url_categorie_brute',
        type_=sa.String(500),
        postgresql_using='NULL::varchar',
        existing_nullable=True,
    )