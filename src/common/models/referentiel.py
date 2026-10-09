from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from .base import Base


class Referentiel(Base):
    __tablename__ = "referentiels"

    id          = Column(Integer, primary_key=True)
    nom_produit = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    marque      = Column(String(100), nullable=True)
    image       = Column(String(500), nullable=True)
    categorie_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    offre_ids   = Column(ARRAY(Integer), nullable=False, server_default='{}')

    # Semantic embedding (nomic-embed-text, 768-d) — see OffreNormalisee.embedding.
    embedding   = Column(Vector(768), nullable=True)

    candidats = relationship("Candidat", back_populates="referentiel")


class Candidat(Base):
    __tablename__ = "candidats"

    id               = Column(Integer, primary_key=True)
    offre_a_id       = Column(Integer, ForeignKey("offres_normalisees.id"), nullable=False)
    offre_b_id       = Column(Integer, ForeignKey("offres_normalisees.id"), nullable=False)
    referentiel_id   = Column(Integer, ForeignKey("referentiels.id"),       nullable=True)
    score_confluence = Column(Float,       nullable=True)
    statut           = Column(String(30),  nullable=True)
    id_validateur    = Column(Integer, ForeignKey("utilisateurs.id"),       nullable=True)
    date_validation  = Column(DateTime, nullable=True)
    date_proposition = Column(DateTime, server_default=func.now(), nullable=True)
    commentaire      = Column(Text, nullable=True)

    referentiel = relationship("Referentiel",    back_populates="candidats")
    details     = relationship("DetailCritere",  back_populates="candidat")


class DetailCritere(Base):
    __tablename__ = "details_criteres"

    id          = Column(Integer, primary_key=True)
    candidat_id = Column(Integer, ForeignKey("candidats.id"), nullable=True)
    critere     = Column(String(50),  nullable=True)
    score       = Column(Float,       nullable=True)
    detail      = Column(String(500), nullable=True)

    candidat = relationship("Candidat", back_populates="details")