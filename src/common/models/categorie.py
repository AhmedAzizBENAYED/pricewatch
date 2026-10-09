from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from .base import Base

class Categorie(Base):
    __tablename__ = "categories"
    id            = Column(Integer, primary_key=True)
    nom           = Column(String(100), nullable=False)
    id_parent     = Column(Integer, ForeignKey("categories.id"), nullable=True)
    urls_par_site = Column(JSONB, nullable=True)

    parent            = relationship("Categorie",      remote_side="Categorie.id")
    tenant_categories = relationship("TenantCategorie", back_populates="categorie")