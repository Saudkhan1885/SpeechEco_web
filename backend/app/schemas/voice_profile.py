"""
Pydantic schemas for Voice Profile
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class VoiceProfileCreate(BaseModel):
    name: str
    description: Optional[str] = None


class VoiceProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    pitch_shift: Optional[float] = None
    speed_rate: Optional[float] = None
    volume: Optional[float] = None


class VoiceProfileResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    pitch_shift: float
    speed_rate: float
    volume: float
    original_audio_path: Optional[str]
    audio_duration: Optional[float]
    is_predefined: bool
    is_active: bool
    created_at: datetime
    owner_id: Optional[int]

    class Config:
        from_attributes = True
