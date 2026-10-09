"""add own_site_id and own_brand to tenants

Revision ID: c1d2e3f4g5h6
Revises: b1c2d3e4f5a6
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'c1d2e3f4g5h6'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tenants', sa.Column('own_site_id', sa.Integer(), nullable=True))
    op.add_column('tenants', sa.Column('own_brand', sa.String(255), nullable=True))
    op.create_foreign_key(
        'fk_tenants_own_site_id',
        'tenants', 'sites_source',
        ['own_site_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('fk_tenants_own_site_id', 'tenants', type_='foreignkey')
    op.drop_column('tenants', 'own_brand')
    op.drop_column('tenants', 'own_site_id')