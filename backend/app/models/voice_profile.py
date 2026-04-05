"""
Voice Profile model for storing cloned voice parameters
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class VoiceProfile(Base):
    __tablename__ = "voice_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    
    # Mock voice parameters (simulating cloned voice characteristics)
    pitch_shift = Column(Float, default=1.0)  # 0.5 to 2.0
    speed_rate = Column(Float, default=1.0)   # 0.5 to 2.0
    volume = Column(Float, default=1.0)       # 0.0 to 1.0
    
    # Original audio file reference
    original_audio_path = Column(String(500), nullable=True)
    audio_duration = Column(Float, nullable=True)  # Duration in seconds
    
    # Metadata
    is_predefined = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Foreign key
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    owner = relationship("User", back_populates="voice_profiles")
