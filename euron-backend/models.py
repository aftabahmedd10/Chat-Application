from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    password = Column(String)


class Conversation(Base):
    __tablename__ = "conversations" 

    id = Column(Integer, primary_key=True, index=True)
    is_group = Column(Boolean, default=False)
    title = Column(String, nullable=True)  # null for 1:1 chat
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    creator = relationship("User", backref="created_conversations")
    participants = relationship("ConversationParticipant", back_populates="conversation")
    messages = relationship("Message", back_populates="conversation")


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(String, default="member")  # "admin" for group admins
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="participants")
    user = relationship("User", backref="conversation_participations")



class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    sender_id = Column(Integer, ForeignKey("users.id"))

    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="sent")  # can become "delivered", "seen"

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", backref="messages_sent")
