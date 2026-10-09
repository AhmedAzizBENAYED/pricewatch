"""add AI assistant tables: user_memories, tenant_documents, document_chunks + ia fields

Revision ID: f6e5d4c3b2a1
Revises: a1b2c3d4e5f6, d1e2f3g4h5i6
Create Date: 2026-05-30
"""
from alembic import op

revision = 'f6e5d4c3b2a1'
down_revision = ('a1b2c3d4e5f6', 'd1e2f3g4h5i6')
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("""
        CREATE TABLE IF NOT EXISTS user_memories (
            id             SERIAL PRIMARY KEY,
            id_utilisateur INTEGER NOT NULL
                           REFERENCES utilisateurs(id)
                           ON DELETE CASCADE,
            content        TEXT NOT NULL,
            category       VARCHAR(50),
            created_at     TIMESTAMPTZ DEFAULT now(),
            last_accessed  TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_memories_user ON user_memories(id_utilisateur)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant_documents (
            id             SERIAL PRIMARY KEY,
            tenant_id      INTEGER NOT NULL
                           REFERENCES tenants(id)
                           ON DELETE CASCADE,
            id_utilisateur INTEGER NOT NULL
                           REFERENCES utilisateurs(id),
            filename       VARCHAR(255) NOT NULL,
            file_type      VARCHAR(20),
            chunk_count    INTEGER DEFAULT 0,
            uploaded_at    TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenant_docs_tenant ON tenant_documents(tenant_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id          SERIAL PRIMARY KEY,
            document_id INTEGER NOT NULL
                        REFERENCES tenant_documents(id)
                        ON DELETE CASCADE,
            tenant_id   INTEGER NOT NULL,
            content     TEXT NOT NULL,
            embedding   vector(768),
            chunk_index INTEGER,
            metadata    JSONB DEFAULT '{}'
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_doc_chunks_tenant ON document_chunks(tenant_id)")
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_doc_chunks_embedding
        ON document_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 50)
    """)

    op.execute("ALTER TABLE conversations_ia ADD COLUMN IF NOT EXISTS titre VARCHAR(255)")
    op.execute("ALTER TABLE conversations_ia ADD COLUMN IF NOT EXISTS resume TEXT")
    op.execute("ALTER TABLE messages_ia ADD COLUMN IF NOT EXISTS sources JSONB")


def downgrade():
    op.execute("ALTER TABLE messages_ia DROP COLUMN IF EXISTS sources")
    op.execute("ALTER TABLE conversations_ia DROP COLUMN IF EXISTS resume")
    op.execute("ALTER TABLE conversations_ia DROP COLUMN IF EXISTS titre")
    op.execute("DROP TABLE IF EXISTS document_chunks")
    op.execute("DROP TABLE IF EXISTS tenant_documents")
    op.execute("DROP TABLE IF EXISTS user_memories")
