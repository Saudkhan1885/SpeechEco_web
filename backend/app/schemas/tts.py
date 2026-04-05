"""
Pydantic schemas for Text-to-Speech
"""
from pydantic import BaseModel, Field
from typing import Optional


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[int] = None  # If None, use default voice
    exaggeration: float = Field(default=0.5, ge=0.0, le=1.0, description="Emotion exaggeration control")
    cfg_weight: float = Field(default=0.5, ge=0.0, le=1.0, description="CFG weight for pacing")
    temperature: float = Field(default=0.8, ge=0.1, le=2.0, description="Generation temperature")


class TTSResponse(BaseModel):
    audio_url: str
    duration: Optional[float] = None
    text: str
    voice_id: Optional[int]


class VoiceConversionRequest(BaseModel):
    source_audio_url: str  # URL or path to source audio
    target_voice_id: int  # Voice profile to convert to


class VoiceConversionResponse(BaseModel):
    audio_url: str
    duration: Optional[float] = None
    source_audio_url: str
    target_voice_id: int


class ChatterboxStatusResponse(BaseModel):
    available: bool
    device: str
    tts_loaded: bool
    vc_loaded: bool
    sample_rate: int
