from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .base import Base


class ScrapingCategoryStat(Base):
    __tablename__ = "scraping_category_stats"

    id             = Column(Integer, primary_key=True)
    scrapper_id    = Column(Integer, ForeignKey("scrappeurs.id", ondelete="CASCADE"), nullable=False, index=True)
    site_id        = Column(String(50), nullable=False)
    category_url   = Column(String(500), nullable=False)
    page_number    = Column(Integer, nullable=False, default=1)
    products_found = Column(Integer, nullable=False, default=0)
    has_next_page  = Column(Integer, nullable=False, default=0)  # 0/1 bool
    duration_ms    = Column(Float, nullable=True)
    scraped_at     = Column(DateTime(timezone=True), nullable=False,
                            default=lambda: datetime.now(timezone.utc))

    scrapper = relationship("Scrapper")