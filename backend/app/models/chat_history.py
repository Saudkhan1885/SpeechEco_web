"""
Chat History model for storing conversation history
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), index=True, nullable=False)
    
    # Message content
    user_message = Column(Text, nullable=False)
    assistant_response = Column(Text, nullable=False)
    audio_url = Column(String(500), nullable=True)
    
    # Metadata
    mode = Column(String(50), default="text-to-audio")  # text-to-audio, audio-to-audio
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Foreign key
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="chat_history")
