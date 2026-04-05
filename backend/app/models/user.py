"""
User model for authentication
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)  # Nullable for OAuth users
    full_name = Column(String(255), nullable=True)
    google_id = Column(String(255), unique=True, nullable=True)  # Google OAuth ID
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Usage counters
    tts_generation_count = Column(Integer, default=0)
    document_processed_count = Column(Integer, default=0)

    # Profile picture
    avatar_url = Column(String(500), nullable=True)

    # Relationships
    voice_profiles = relationship("VoiceProfile", back_populates="owner")
    chat_history = relationship("ChatHistory", back_populates="user")
