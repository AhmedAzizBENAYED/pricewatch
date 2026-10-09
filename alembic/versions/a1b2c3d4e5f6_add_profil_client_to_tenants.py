"""add profil_client to tenants

Revision ID: a1b2c3d4e5f6
Revises: z6a7b8c9d0e1
Create Date: 2026-05-23
"""
from alembic import op

revision = 'a1b2c3d4e5f6'
down_revision = 'z6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE tenants ADD COLUMN profil_client VARCHAR(20) NOT NULL DEFAULT 'SITE_ECOMMERCE'"
    )
    op.execute(
        "ALTER TABLE tenants ADD CONSTRAINT chk_profil_client "
        "CHECK (profil_client IN ('SITE_ECOMMERCE', 'MARQUE'))"
    )


def downgrade():
    op.execute("ALTER TABLE tenants DROP CONSTRAINT chk_profil_client")
    op.execute("ALTER TABLE tenants DROP COLUMN profil_client")