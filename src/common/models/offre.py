from sqlalchemy import Column, Integer, String, Numeric, Boolean, Float, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from .base import Base

class OffreNormalisee(Base):
    __tablename__ = "offres_normalisees"
    __table_args__ = (
        UniqueConstraint("url_produit", name="uq_offre_url"),
    )

    id                   = Column(Integer, primary_key=True)
    nom                  = Column(String(255), nullable=True)
    prix_original        = Column(Numeric(10, 3))
    prix_en_promotion    = Column(Numeric(10, 3))
    prix_unitaire        = Column(Numeric(10, 3))
    est_en_promotion     = Column(Boolean, default=False)
    image                = Column(String(500))
    est_offre_principale = Column(Boolean, default=False)
    statut_stock         = Column(String(50))
    url_produit          = Column(String(500))
    categorie_id         = Column(Integer, ForeignKey("categories.id"))
    offre_brute          = Column(JSONB)
    description          = Column(Text)
    scraper_id           = Column(Integer, ForeignKey("scrappeurs.id"))
    score_qualite        = Column(Float)

    # Normalization fields (populated after scraping)
    marque           = Column(String(255), nullable=True)
    specs_normalises = Column(JSONB, nullable=True)

    # Matching fields (populated by the matching pipeline)
    produit_id   = Column(Integer, nullable=True)   # FK to referentiels.id (no ORM relation)
    match_layer  = Column(String(50), nullable=True)
    match_score  = Column(Float, nullable=True)

    # Semantic embedding (nomic-embed-text, 768-d) — backfilled by
    # scripts/matching/build_embeddings.py, used by the cascade matcher's
    # semantic prefilter stage. Nullable: existing rows work until backfilled.
    embedding    = Column(Vector(768), nullable=True)

    scrapper  = relationship("Scrapper", back_populates="offres_normalisees")
    snapshots = relationship("Snapshot", back_populates="offre")
