from sqlalchemy import Column, Integer, String, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class Alerte(Base):
    __tablename__ = "alertes"
    id                   = Column(Integer, primary_key=True)
    tenant_id            = Column(Integer, ForeignKey("tenants.id"))
    periode_surveillance = Column(String(20))
    type_evenement       = Column(String(50))
    liste_categories     = Column(JSON)
    description          = Column(String(500))
    id_utilisateur       = Column(Integer, ForeignKey("utilisateurs.id"))
    alert                = Column(Boolean, default=True)
    seuil                = Column(Integer, nullable=True)

    tenant = relationship("Tenant", back_populates="alertes")