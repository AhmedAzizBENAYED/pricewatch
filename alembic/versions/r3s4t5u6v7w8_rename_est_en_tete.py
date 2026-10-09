"""rename est_en_tete to est_offre_principale in offres_normalisees

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-04-21

"""
from alembic import op

revision = 'r3s4t5u6v7w8'
down_revision = 'q2r3s4t5u6v7'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('offres_normalisees', 'est_en_tete', new_column_name='est_offre_principale')


def downgrade():
    op.alter_column('offres_normalisees', 'est_offre_principale', new_column_name='est_en_tete')