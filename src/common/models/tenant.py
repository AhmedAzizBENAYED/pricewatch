from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from .base import Base

class Admin(Base):
    __tablename__ = "admins"
    id            = Column(Integer, primary_key=True)
    nom           = Column(String(100), nullable=False)
    email         = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=True)
    est_actif     = Column(Boolean, default=True, nullable=False, server_default="true")

class Tenant(Base):
    __tablename__ = "tenants"
    id               = Column(Integer, primary_key=True)
    nom_organisation = Column(String(100), nullable=False)
    est_actif        = Column(Boolean, default=True)
    plan_abonnement  = Column(String(20), default="BASIC")
    profil_client    = Column(String(20), nullable=False, default="SITE_ECOMMERCE")
    date_creation    = Column(DateTime, server_default=func.now())
    own_site_id      = Column(Integer, ForeignKey("sites_source.id", ondelete="SET NULL"), nullable=True)
    own_brand        = Column(String(255), nullable=True)

    utilisateurs      = relationship("Utilisateur",    back_populates="tenant")
    tenant_categories = relationship("TenantCategorie", back_populates="tenant")
    alertes           = relationship("Alerte",          back_populates="tenant")
    rapports          = relationship("Rapport",         back_populates="tenant")
    own_site          = relationship("SiteSource",      foreign_keys=[own_site_id])