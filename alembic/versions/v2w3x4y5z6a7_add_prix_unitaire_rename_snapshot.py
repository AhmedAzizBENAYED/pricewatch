"""add prix_unitaire; rename snapshots.prix_promotion → prix_en_promotion; precision 10,3

Revision ID: v2w3x4y5z6a7
Revises: u6v7w8x9y0z1
Create Date: 2026-05-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'v2w3x4y5z6a7'
down_revision = 'u6v7w8x9y0z1'
branch_labels = None
depends_on = None


def upgrade():
    # ── offres_normalisees ──────────────────────────────────────────────────
    op.add_column('offres_normalisees',
        sa.Column('prix_unitaire', sa.Numeric(10, 3), nullable=True))

    # Update existing price columns to precision 10,3
    op.alter_column('offres_normalisees', 'prix_original',
        type_=sa.Numeric(10, 3), existing_nullable=True)
    op.alter_column('offres_normalisees', 'prix_en_promotion',
        type_=sa.Numeric(10, 3), existing_nullable=True)

    # ── snapshots ───────────────────────────────────────────────────────────
    # Rename prix_promotion → prix_en_promotion for consistency
    op.alter_column('snapshots', 'prix_promotion',
        new_column_name='prix_en_promotion',
        type_=sa.Numeric(10, 3), existing_nullable=True)

    op.alter_column('snapshots', 'prix_original',
        type_=sa.Numeric(10, 3), existing_nullable=True)

    op.add_column('snapshots',
        sa.Column('prix_unitaire', sa.Numeric(10, 3), nullable=True))


def downgrade():
    op.drop_column('snapshots', 'prix_unitaire')
    op.alter_column('snapshots', 'prix_en_promotion',
        new_column_name='prix_promotion',
        type_=sa.Numeric(10, 2), existing_nullable=True)

    op.drop_column('offres_normalisees', 'prix_unitaire')
    op.alter_column('offres_normalisees', 'prix_original',
        type_=sa.Numeric(10, 2), existing_nullable=True)
    op.alter_column('offres_normalisees', 'prix_en_promotion',
        type_=sa.Numeric(10, 2), existing_nullable=True)