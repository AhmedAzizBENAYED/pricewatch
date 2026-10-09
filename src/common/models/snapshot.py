from sqlalchemy import Column, Integer, String, Numeric, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from .base import Base

class Snapshot(Base):
    __tablename__ = "snapshots"

    id                         = Column(Integer, primary_key=True)
    offre_id                   = Column(Integer, ForeignKey("offres_normalisees.id", ondelete="CASCADE"), nullable=False)
    prix_original              = Column(Numeric(10, 3), nullable=True)
    prix_en_promotion          = Column(Numeric(10, 3), nullable=True)
    prix_unitaire              = Column(Numeric(10, 3), nullable=True)
    stock_status               = Column(String(50), nullable=True)
    offre_brute                = Column(JSONB, nullable=True)
    score_qualite              = Column(Float, nullable=True)
    date_debut_observation     = Column(DateTime(timezone=True), nullable=False)
    date_fin_observation       = Column(DateTime(timezone=True), nullable=True)
    nb_observations_identiques = Column(Integer, nullable=False, default=1)

    offre = relationship("OffreNormalisee", back_populates="snapshots")