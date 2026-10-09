from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from .base import Base
import uuid

class ConversationIA(Base):
    __tablename__ = "conversations_ia"
    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_utilisateur         = Column(Integer, ForeignKey("utilisateurs.id"), nullable=True)
    type                   = Column(String(50))
    titre                  = Column(String(255), nullable=True)
    resume                 = Column(Text, nullable=True)
    date_debut             = Column(DateTime, server_default=func.now())
    date_derniere_activite = Column(DateTime, server_default=func.now())

    utilisateur = relationship("Utilisateur", back_populates="conversations")
    messages    = relationship("MessageIA",   back_populates="conversation")

class MessageIA(Base):
    __tablename__ = "messages_ia"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_utilisateur  = Column(Integer, ForeignKey("utilisateurs.id"), nullable=True)
    id_conversation = Column(UUID(as_uuid=True), ForeignKey("conversations_ia.id"))
    role            = Column(String(20))
    contenu         = Column(String)
    sources         = Column(JSONB, nullable=True)
    date_creation   = Column(DateTime, server_default=func.now())

    conversation = relationship("ConversationIA", back_populates="messages")