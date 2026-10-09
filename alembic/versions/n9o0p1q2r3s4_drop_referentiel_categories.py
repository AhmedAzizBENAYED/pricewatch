"""drop_referentiel_categories

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-04-20 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'n9o0p1q2r3s4'
down_revision: Union[str, None] = 'm8n9o0p1q2r3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        'categories_referentiel_categorie_id_fkey',
        'categories',
        type_='foreignkey',
    )
    op.drop_column('categories', 'referentiel_categorie_id')
    op.drop_table('referentiel_categories')


def downgrade() -> None:
    op.create_table(
        'referentiel_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nom', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('cluster_id', sa.Integer(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('canonical_site', sa.String(50), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column('categories',
        sa.Column('referentiel_categorie_id', sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        'categories_referentiel_categorie_id_fkey',
        'categories', 'referentiel_categories',
        ['referentiel_categorie_id'], ['id'],
        ondelete='SET NULL',
    )