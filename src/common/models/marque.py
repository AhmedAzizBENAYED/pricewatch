from sqlalchemy import Boolean, Column, Integer, String
from .base import Base


class Marque(Base):
    __tablename__ = "marques"
    id        = Column(Integer, primary_key=True)
    nom       = Column(String(100), nullable=False)
    est_actif = Column(Boolean, nullable=False, default=True)