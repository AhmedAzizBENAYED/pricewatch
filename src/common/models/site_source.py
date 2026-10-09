from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship
from .base import Base

class SiteSource(Base):
    __tablename__ = "sites_source"
    id         = Column(Integer, primary_key=True)
    url        = Column(String(500), nullable=False)
    name       = Column(String(100), nullable=False)
    est_actif  = Column(Boolean, default=True)
    scraper_id = Column(String(100))

    scrappeurs = relationship("Scrapper", back_populates="site_source")