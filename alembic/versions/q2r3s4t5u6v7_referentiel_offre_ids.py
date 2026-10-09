"""add offre_ids array to referentiels

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-04-21

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = 'q2r3s4t5u6v7'
down_revision = 'p1q2r3s4t5u6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'referentiels',
        sa.Column('offre_ids', ARRAY(sa.Integer()), nullable=False, server_default='{}')
    )
    # GIN index for fast ANY() lookups: WHERE offre_id = ANY(offre_ids)
    op.create_index(
        'ix_referentiels_offre_ids',
        'referentiels',
        ['offre_ids'],
        postgresql_using='gin'
    )


def downgrade():
    op.drop_index('ix_referentiels_offre_ids', table_name='referentiels')
    op.drop_column('referentiels', 'offre_ids')