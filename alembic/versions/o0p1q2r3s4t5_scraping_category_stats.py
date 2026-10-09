"""add scraping_category_stats table

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'o0p1q2r3s4t5'
down_revision: Union[str, None] = 'n9o0p1q2r3s4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'scraping_category_stats',
        sa.Column('id',             sa.Integer(),                    nullable=False),
        sa.Column('scrapper_id',    sa.Integer(),                    nullable=False),
        sa.Column('site_id',        sa.String(50),                   nullable=False),
        sa.Column('category_url',   sa.String(500),                  nullable=False),
        sa.Column('page_number',    sa.Integer(),                    nullable=False, server_default='1'),
        sa.Column('products_found', sa.Integer(),                    nullable=False, server_default='0'),
        sa.Column('has_next_page',  sa.Integer(),                    nullable=False, server_default='0'),
        sa.Column('duration_ms',    sa.Float(),                      nullable=True),
        sa.Column('scraped_at',     sa.DateTime(timezone=True),      nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['scrapper_id'], ['scrappeurs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_scraping_category_stats_scrapper_id',
                    'scraping_category_stats', ['scrapper_id'])
    op.create_index('ix_scraping_category_stats_site_scraped',
                    'scraping_category_stats', ['site_id', 'scraped_at'])


def downgrade() -> None:
    op.drop_table('scraping_category_stats')