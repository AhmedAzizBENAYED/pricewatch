"""add utilisateurs.est_actif

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-05-23
"""
from alembic import op

revision = 'z6a7b8c9d0e1'
down_revision = 'y5z6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE utilisateurs ADD COLUMN est_actif BOOLEAN NOT NULL DEFAULT TRUE"
    )


def downgrade():
    op.execute("ALTER TABLE utilisateurs DROP COLUMN est_actif")