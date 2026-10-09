"""add plan_data and analysis_data to rapports

Revision ID: rpt2rpt3rpt4
Revises: rpt1rpt2rpt3
Create Date: 2026-05-31
"""
from alembic import op

revision = 'rpt2rpt3rpt4'
down_revision = 'rpt1rpt2rpt3'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE rapports
          ADD COLUMN IF NOT EXISTS plan_data     JSONB,
          ADD COLUMN IF NOT EXISTS analysis_data JSONB
    """)


def downgrade():
    op.execute("""
        ALTER TABLE rapports
          DROP COLUMN IF EXISTS plan_data,
          DROP COLUMN IF EXISTS analysis_data
    """)
