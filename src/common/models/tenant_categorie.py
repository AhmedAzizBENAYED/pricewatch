from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base


class TenantCategorie(Base):
    __tablename__ = "tenant_categories"

    tenant_id    = Column(Integer, ForeignKey("tenants.id",    ondelete="CASCADE"), primary_key=True, nullable=False)
    categorie_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True, nullable=False)

    tenant    = relationship("Tenant",    back_populates="tenant_categories")
    categorie = relationship("Categorie", back_populates="tenant_categories")