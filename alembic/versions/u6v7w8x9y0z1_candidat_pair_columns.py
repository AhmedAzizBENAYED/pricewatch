"""candidats: replace offre_id with offre_a_id + offre_b_id (one row per pair)

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'u6v7w8x9y0z1'
down_revision = 't5u6v7w8x9y0'
branch_labels = None
depends_on = None


def upgrade():
    # Table is empty at this point (matching runs after migration)
    op.drop_column('candidats', 'offre_id')
    op.add_column('candidats', sa.Column('offre_a_id', sa.Integer(), nullable=False))
    op.add_column('candidats', sa.Column('offre_b_id', sa.Integer(), nullable=False))
    op.create_foreign_key('fk_candidats_offre_a', 'candidats', 'offres_normalisees', ['offre_a_id'], ['id'])
    op.create_foreign_key('fk_candidats_offre_b', 'candidats', 'offres_normalisees', ['offre_b_id'], ['id'])


def downgrade():
    op.drop_constraint('fk_candidats_offre_b', 'candidats', type_='foreignkey')
    op.drop_constraint('fk_candidats_offre_a', 'candidats', type_='foreignkey')
    op.drop_column('candidats', 'offre_b_id')
    op.drop_column('candidats', 'offre_a_id')
    op.add_column('candidats', sa.Column('offre_id', sa.Integer(), sa.ForeignKey('offres_normalisees.id'), nullable=True))