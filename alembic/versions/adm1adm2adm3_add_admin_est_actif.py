"""Add est_actif to admins table

Revision ID: adm1adm2adm3
Revises: rag1rag2rag3
Create Date: 2026-06-09
"""
import sqlalchemy as sa
from alembic import op

revision = 'adm1adm2adm3'
down_revision = 'rag1rag2rag3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'admins',
        sa.Column('est_actif', sa.Boolean(), nullable=False, server_default='true'),
    )


def downgrade():
    op.drop_column('admins', 'est_actif')
