"""add_marques

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b1c2d3
Create Date: 2026-04-15 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e7f8a9b1c2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'marques',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nom', sa.String(length=100), nullable=False),
        sa.Column('est_actif', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nom', name='uq_marque_nom'),
    )


def downgrade() -> None:
    op.drop_table('marques')