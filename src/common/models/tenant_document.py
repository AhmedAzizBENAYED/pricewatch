from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from .base import Base


class TenantDocument(Base):
    __tablename__ = "tenant_documents"

    id             = Column(Integer, primary_key=True)
    tenant_id      = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    id_utilisateur = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    filename       = Column(String(255), nullable=False)
    file_type      = Column(String(20))
    chunk_count    = Column(Integer, default=0)
    uploaded_at    = Column(DateTime(timezone=True), server_default=func.now())
