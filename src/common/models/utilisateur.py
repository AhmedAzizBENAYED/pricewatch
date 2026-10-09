from sqlalchemy import Boolean, Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class Utilisateur(Base):
    __tablename__ = "utilisateurs"
    id            = Column(Integer, primary_key=True)
    tenant_id     = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    nom           = Column(String(100), nullable=False)
    email         = Column(String(255), nullable=False, unique=True)
    url           = Column(String(500))
    role          = Column(String(50), default="MANAGER")
    password_hash = Column(String(255), nullable=True)
    est_actif     = Column(Boolean, nullable=False, default=True)

    tenant        = relationship("Tenant",         back_populates="utilisateurs")
    rapports      = relationship("Rapport",        back_populates="utilisateur")
    conversations = relationship("ConversationIA", back_populates="utilisateur")