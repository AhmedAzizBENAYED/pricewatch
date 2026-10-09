"""schema type fixes: audit FK, promo flag, timestamptz dates, text columns

Revision ID: 5acbf4d4c215
Revises: 4ae3bfeb970c
Create Date: 2026-04-11 13:30:25.414198

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5acbf4d4c215'
down_revision: Union[str, None] = '4ae3bfeb970c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # UUID → INTEGER: existing values cannot be preserved; set to NULL
    op.alter_column('journal_audit', 'id_utilisateur',
               existing_type=sa.UUID(),
               type_=sa.Integer(),
               existing_nullable=True,
               postgresql_using='NULL::integer')
    op.create_foreign_key(None, 'journal_audit', 'utilisateurs', ['id_utilisateur'], ['id'])
    op.add_column('offres_normalisees', sa.Column('est_en_promotion', sa.Boolean(), nullable=True))
    op.alter_column('offres_normalisees', 'description',
               existing_type=sa.VARCHAR(length=1000),
               type_=sa.Text(),
               existing_nullable=True)
    op.create_unique_constraint('uq_offre_url_scraper', 'offres_normalisees', ['url_produit', 'scraper_id'])
    # DATE → TIMESTAMPTZ: cast preserves the date, time defaults to midnight UTC
    op.alter_column('scrappeurs', 'date_debut',
               existing_type=sa.DATE(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True,
               postgresql_using='date_debut::timestamptz')
    op.alter_column('scrappeurs', 'date_fin',
               existing_type=sa.DATE(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True,
               postgresql_using='date_fin::timestamptz')
    op.alter_column('snapshots', 'description',
               existing_type=sa.VARCHAR(length=1000),
               type_=sa.Text(),
               existing_nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('snapshots', 'description',
               existing_type=sa.Text(),
               type_=sa.VARCHAR(length=1000),
               existing_nullable=True)
    op.alter_column('scrappeurs', 'date_fin',
               existing_type=sa.DateTime(timezone=True),
               type_=sa.DATE(),
               existing_nullable=True,
               postgresql_using='date_fin::date')
    op.alter_column('scrappeurs', 'date_debut',
               existing_type=sa.DateTime(timezone=True),
               type_=sa.DATE(),
               existing_nullable=True,
               postgresql_using='date_debut::date')
    op.drop_constraint('uq_offre_url_scraper', 'offres_normalisees', type_='unique')
    op.alter_column('offres_normalisees', 'description',
               existing_type=sa.Text(),
               type_=sa.VARCHAR(length=1000),
               existing_nullable=True)
    op.drop_column('offres_normalisees', 'est_en_promotion')
    op.drop_constraint(None, 'journal_audit', type_='foreignkey')
    op.alter_column('journal_audit', 'id_utilisateur',
               existing_type=sa.Integer(),
               type_=sa.UUID(),
               existing_nullable=True,
               postgresql_using='NULL::uuid')
