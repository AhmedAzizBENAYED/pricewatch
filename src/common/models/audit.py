from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from .base import Base
import uuid

class JournalAudit(Base):
    __tablename__ = "journal_audit"
    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_utilisateur= Column(Integer, ForeignKey("utilisateurs.id"), nullable=True)
    action        = Column(String(100))
    valeurs_avant = Column(JSON)
    valeurs_apres = Column(JSON)
    horodatage    = Column(DateTime, server_default=func.now())