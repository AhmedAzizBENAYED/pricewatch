from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from .base import Base


class UserMemory(Base):
    __tablename__ = "user_memories"

    id             = Column(Integer, primary_key=True)
    id_utilisateur = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False)
    content        = Column(Text, nullable=False)
    category       = Column(String(50))
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    last_accessed  = Column(DateTime(timezone=True), server_default=func.now())
