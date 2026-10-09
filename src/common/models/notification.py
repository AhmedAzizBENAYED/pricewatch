from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, text
from sqlalchemy.orm import relationship
from .base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id              = Column(Integer, primary_key=True)
    id_utilisateur  = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False)
    evenement_id    = Column(Integer, ForeignKey("evenements.id", ondelete="CASCADE"), nullable=False)
    lu              = Column(Boolean, nullable=False, default=False)
    date_creation   = Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    utilisateur     = relationship("Utilisateur")
    evenement       = relationship("Evenement", back_populates="notifications")
