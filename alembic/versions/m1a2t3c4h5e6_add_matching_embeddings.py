"""add embedding columns + ivfflat indexes for the cascade matcher

Adds a semantic embedding (nomic-embed-text, 768-d) to both the canonical
products table (referentiels) and the raw offers table (offres_normalisees),
plus an ivfflat cosine index on each. This mirrors the pattern already used by
document_chunks (see migration f6e5d4c3b2a1) but with lists=100.

Additive and nullable: existing rows keep working until backfilled by
scripts/matching/build_embeddings.py. No existing column is dropped or altered.

Revision ID: m1a2t3c4h5e6
Revises: adm1adm2adm3
Create Date: 2026-06-11
"""
from alembic import op

revision = 'm1a2t3c4h5e6'
down_revision = 'adm1adm2adm3'
branch_labels = None
depends_on = None


def upgrade():
    # pgvector is already installed (document_chunks uses it); keep idempotent.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ── embedding columns (nullable, additive) ────────────────────────────────
    op.execute("ALTER TABLE referentiels        ADD COLUMN IF NOT EXISTS embedding vector(768)")
    op.execute("ALTER TABLE offres_normalisees  ADD COLUMN IF NOT EXISTS embedding vector(768)")

    # ── ivfflat cosine indexes (lists=100) ────────────────────────────────────
    # ivfflat only indexes rows that have a value, so creating the index now (on
    # an all-NULL column) is fine; it fills in as build_embeddings backfills.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_referentiels_embedding
        ON referentiels
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_offres_embedding
        ON offres_normalisees
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_offres_embedding")
    op.execute("DROP INDEX IF EXISTS ix_referentiels_embedding")
    op.execute("ALTER TABLE offres_normalisees  DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE referentiels        DROP COLUMN IF EXISTS embedding")
