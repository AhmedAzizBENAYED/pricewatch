"""add cle_synonymes table for cross-site fiche_technique key mapping

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'w3x4y5z6a7b8'
down_revision = 'v2w3x4y5z6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cle_synonymes',
        sa.Column('id',               sa.Integer(),     primary_key=True),
        sa.Column('site_id',          sa.String(50),    nullable=False),
        sa.Column('nom_site',         sa.String(255),   nullable=False),
        sa.Column('cle_canonique_id', sa.Integer(),     nullable=True),
        sa.Column('statut',           sa.String(20),    nullable=False, server_default='PROPOSED'),
        sa.ForeignKeyConstraint(['cle_canonique_id'], ['caracteristique_cles.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('site_id', 'nom_site', name='uq_cle_synonyme_site_nom'),
    )
    op.create_index('ix_cle_synonymes_site_id',    'cle_synonymes', ['site_id'])
    op.create_index('ix_cle_synonymes_canonique',  'cle_synonymes', ['cle_canonique_id'])


def downgrade():
    op.drop_index('ix_cle_synonymes_canonique', table_name='cle_synonymes')
    op.drop_index('ix_cle_synonymes_site_id',   table_name='cle_synonymes')
    op.drop_table('cle_synonymes')