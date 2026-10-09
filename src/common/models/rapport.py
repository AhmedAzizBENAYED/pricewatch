from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from .base import Base


class Rapport(Base):
    __tablename__ = "rapports"
    id               = Column(Integer, primary_key=True)
    tenant_id        = Column(Integer, ForeignKey("tenants.id"))
    id_utilisateur   = Column(Integer, ForeignKey("utilisateurs.id"))
    titre            = Column(String(255))
    date_creation    = Column(DateTime(timezone=True), server_default=func.now())

    # generation columns
    type             = Column(String(20))   # HEBDOMADAIRE | MENSUEL | PERSONNALISE
    format           = Column(String(10))   # PDF | EXCEL
    statut           = Column(String(20), nullable=False, default="EN_ATTENTE")
    progression      = Column(Integer, nullable=False, default=0)
    date_generation  = Column(DateTime(timezone=True), nullable=True)
    file_path        = Column(String(500), nullable=True)
    sections         = Column(JSONB, nullable=False, default=list)
    periode_debut    = Column(Date, nullable=True)
    periode_fin      = Column(Date, nullable=True)
    plan_data        = Column(JSONB, nullable=True)
    analysis_data    = Column(JSONB, nullable=True)

    tenant      = relationship("Tenant",      back_populates="rapports")
    utilisateur = relationship("Utilisateur", back_populates="rapports")
