"""Add GIN full-text search index on document_chunks for hybrid RAG

Revision ID: rag1rag2rag3
Revises: rpt2rpt3rpt4
Create Date: 2026-05-31
"""
from alembic import op

revision = 'rag1rag2rag3'
down_revision = 'rpt2rpt3rpt4'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_doc_chunks_fts
        ON document_chunks
        USING GIN (to_tsvector('french', content))
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_doc_chunks_fts")
