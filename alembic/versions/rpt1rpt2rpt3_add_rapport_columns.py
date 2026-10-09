"""add rapport generation columns

Revision ID: rpt1rpt2rpt3
Revises: f6e5d4c3b2a1
Create Date: 2026-05-31
"""
from alembic import op

revision = 'rpt1rpt2rpt3'
down_revision = 'f6e5d4c3b2a1'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE rapports
          ADD COLUMN IF NOT EXISTS type VARCHAR(20)
            CHECK (type IN ('HEBDOMADAIRE', 'MENSUEL', 'PERSONNALISE')),
          ADD COLUMN IF NOT EXISTS format VARCHAR(10)
            CHECK (format IN ('PDF', 'EXCEL')),
          ADD COLUMN IF NOT EXISTS statut VARCHAR(20)
            NOT NULL DEFAULT 'EN_ATTENTE'
            CHECK (statut IN ('EN_ATTENTE', 'EN_COURS', 'PRET', 'ERREUR')),
          ADD COLUMN IF NOT EXISTS progression INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS date_generation TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS file_path VARCHAR(500),
          ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS periode_debut DATE,
          ADD COLUMN IF NOT EXISTS periode_fin DATE
    """)


def downgrade():
    op.execute("""
        ALTER TABLE rapports
          DROP COLUMN IF EXISTS type,
          DROP COLUMN IF EXISTS format,
          DROP COLUMN IF EXISTS statut,
          DROP COLUMN IF EXISTS progression,
          DROP COLUMN IF EXISTS date_generation,
          DROP COLUMN IF EXISTS file_path,
          DROP COLUMN IF EXISTS sections,
          DROP COLUMN IF EXISTS periode_debut,
          DROP COLUMN IF EXISTS periode_fin
    """)
