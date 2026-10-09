from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class Scrapper(Base):
    __tablename__ = "scrappeurs"
    id             = Column(Integer, primary_key=True)
    date_debut     = Column(DateTime(timezone=True))
    date_fin       = Column(DateTime(timezone=True))
    statut         = Column(String(20), default="EN_ATTENTE")
    site_source_id = Column(Integer, ForeignKey("sites_source.id"))

    site_source      = relationship("SiteSource",     back_populates="scrappeurs")
    offres_normalisees = relationship("OffreNormalisee", back_populates="scrapper")