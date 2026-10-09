from sqlalchemy import Column, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
from .base import Base


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id          = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("tenant_documents.id", ondelete="CASCADE"), nullable=False)
    tenant_id   = Column(Integer, nullable=False)
    content     = Column(Text, nullable=False)
    embedding   = Column(Vector(768))
    chunk_index = Column(Integer)
    chunk_meta  = Column("metadata", JSONB, default={})
