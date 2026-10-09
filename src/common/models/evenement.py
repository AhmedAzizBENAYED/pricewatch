from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.orm import relationship
from .base import Base


class Evenement(Base):
    __tablename__ = "evenements"

    id              = Column(Integer, primary_key=True)
    offre_id        = Column(Integer, ForeignKey("offres_normalisees.id", ondelete="CASCADE"), nullable=False)
    type_evenement  = Column(String(50), nullable=False)
    valeur_avant    = Column(Numeric(10, 3), nullable=True)
    valeur_apres    = Column(Numeric(10, 3), nullable=True)
    date_detection  = Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    offre           = relationship("OffreNormalisee")
    notifications   = relationship("Notification", back_populates="evenement")
