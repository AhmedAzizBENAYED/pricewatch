"""add_category_matches

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'j5k6l7m8n9o0'
down_revision: Union[str, None] = 'i4j5k6l7m8n9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'category_matches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('categorie_a_id', sa.Integer(), nullable=False),
        sa.Column('categorie_b_id', sa.Integer(), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('statut', sa.String(length=20), nullable=False,
                  server_default='PROPOSED'),
        sa.ForeignKeyConstraint(['categorie_a_id'], ['categories.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['categorie_b_id'], ['categories.id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('categorie_a_id', 'categorie_b_id',
                            name='uq_category_match_pair'),
    )
    op.create_index('ix_category_matches_statut', 'category_matches', ['statut'])


def downgrade() -> None:
    op.drop_index('ix_category_matches_statut', table_name='category_matches')
    op.drop_table('category_matches')