"""widen candidats.commentaire from VARCHAR(500) to TEXT

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-05-22
"""
from alembic import op

revision = 'y5z6a7b8c9d0'
down_revision = 'x4y5z6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE candidats ALTER COLUMN commentaire TYPE TEXT")


def downgrade():
    op.execute("ALTER TABLE candidats ALTER COLUMN commentaire TYPE VARCHAR(500)")
