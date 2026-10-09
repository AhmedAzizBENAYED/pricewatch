"""add seuil to alertes and fix periode_surveillance type

Revision ID: d1e2f3g4h5i6
Revises: c1d2e3f4g5h6
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'd1e2f3g4h5i6'
down_revision = 'c1d2e3f4g5h6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('alertes', sa.Column('seuil', sa.Integer(), nullable=True))
    op.alter_column(
        'alertes',
        'periode_surveillance',
        existing_type=sa.Date(),
        type_=sa.String(20),
        existing_nullable=True,
        postgresql_using='periode_surveillance::text',
    )


def downgrade():
    op.drop_column('alertes', 'seuil')
    op.alter_column(
        'alertes',
        'periode_surveillance',
        existing_type=sa.String(20),
        type_=sa.Date(),
        existing_nullable=True,
        postgresql_using='periode_surveillance::date',
    )
