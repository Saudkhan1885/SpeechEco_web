"""
Voice Cloning Service - Voice profile creation for Chatterbox TTS
"""
import os
import uuid
from typing import Optional, Tuple, List
from pydub import AudioSegment
import librosa
import soundfile as sf
from sqlalchemy.orm import Session

from app.config import UPLOADS_DIR, MIN_CLONE_DURATION, MAX_CLONE_DURATION
from app.models.voice_profile import VoiceProfile
from app.services.storage_service import storage_service


class VoiceService:
    """Voice cloning service for Chatterbox TTS voice profiles"""
    
    def __init__(self):
        self._ensure_uploads_dir()
    
    def _ensure_uploads_dir(self):
        """Ensure uploads directory exists"""
        os.makedirs(UPLOADS_DIR, exist_ok=True)
    
    def validate_audio_duration(self, file_path: str) -> Tuple[bool, float, str]:
        """
        Validate audio file duration. No max limit, but recommend 3-10 seconds for best quality.
        
        Returns:
            Tuple of (is_valid, duration, warning_message)
        """
        try:
            audio = AudioSegment.from_file(file_path)
            duration = len(audio) / 1000.0  # Convert to seconds
            
            if duration < MIN_CLONE_DURATION:
                return False, duration, f"Audio too short. Minimum {MIN_CLONE_DURATION} second required."
            
            # Return warning for long audio, but still allow it
            warning = ""
            if duration > 10.0:
                warning = "Note: For best voice cloning results, 3-10 seconds of clear audio is recommended."
            
            return True, duration, warning
        except Exception as e:
            return False, 0, f"Invalid audio file: {str(e)}"
    
    def process_audio_for_chatterbox(self, file_path: str) -> str:
        """
        Process audio file to optimal format for Chatterbox (24kHz WAV).
        
        Args:
            file_path: Path to input audio file
            
        Returns:
            Path to processed audio file
        """
        try:
            # Load and resample to 24kHz (Chatterbox's native sample rate)
            audio, sr = librosa.load(file_path, sr=24000)
            
            # Normalize audio
            audio = librosa.util.normalize(audio)
            
            # Save processed file
            processed_filename = f"processed_{uuid.uuid4()}.wav"
            processed_path = os.path.join(UPLOADS_DIR, processed_filename)
            sf.write(processed_path, audio, 24000)
            
            return processed_path
        except Exception as e:
            print(f"Error processing audio: {e}")
            return file_path  # Return original if processing fails
    
    def save_audio_file(self, file_content: bytes, original_filename: str) -> str:
        """
        Save uploaded audio file.
        
        Returns:
            Saved file path
        """
        # Generate unique filename
        extension = os.path.splitext(original_filename)[1] or ".wav"
        filename = f"{uuid.uuid4()}{extension}"
        filepath = os.path.join(UPLOADS_DIR, filename)

        # Save local file first (needed for validation + preprocessing)
        with open(filepath, "wb") as f:
            f.write(file_content)

        return filepath
    
    def create_voice_profile(
        self,
        db: Session,
        name: str,
        owner_id: int,
        audio_path: Optional[str] = None,
        audio_duration: Optional[float] = None,
        description: Optional[str] = None,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5
    ) -> VoiceProfile:
        """
        Create a new voice profile for Chatterbox TTS.
        
        Args:
            db: Database session
            name: Voice profile name
            owner_id: Owner user ID
            audio_path: Path to audio file (will be processed for Chatterbox)
            audio_duration: Duration of audio in seconds
            description: Optional description
            exaggeration: Default exaggeration setting for this voice
            cfg_weight: Default CFG weight for this voice
            
        Returns:
            Created VoiceProfile
        """
        # Process audio for Chatterbox if provided
        processed_path = None
        if audio_path:
            processed_path = self.process_audio_for_chatterbox(audio_path)

        stored_reference = None
        if processed_path and os.path.exists(processed_path):
            # Persist processed sample in configured storage backend
            stored_reference = storage_service.save_file(
                file_path=processed_path,
                filename=os.path.basename(processed_path),
                category="uploads",
                content_type="audio/wav",
            )
        elif audio_path and os.path.exists(audio_path):
            stored_reference = storage_service.save_file(
                file_path=audio_path,
                filename=os.path.basename(audio_path),
                category="uploads",
                content_type="audio/wav",
            )
        
        voice_profile = VoiceProfile(
            name=name,
            description=description,
            pitch_shift=exaggeration,  # Repurpose as exaggeration
            speed_rate=cfg_weight,     # Repurpose as cfg_weight
            volume=1.0,
            original_audio_path=stored_reference or processed_path or audio_path,
            audio_duration=audio_duration,
            is_predefined=False,
            owner_id=owner_id
        )
        
        db.add(voice_profile)
        db.commit()
        db.refresh(voice_profile)
        
        return voice_profile
    
    def get_user_profiles(self, db: Session, user_id: int) -> List[VoiceProfile]:
        """Get all voice profiles for a user"""
        return db.query(VoiceProfile).filter(
            (VoiceProfile.owner_id == user_id) | (VoiceProfile.is_predefined == True)
        ).all()
    
    def get_predefined_voices(self, db: Session) -> List[VoiceProfile]:
        """Get all predefined voice profiles"""
        return db.query(VoiceProfile).filter(VoiceProfile.is_predefined == True).all()
    
    def get_profile_by_id(self, db: Session, profile_id: int) -> Optional[VoiceProfile]:
        """Get a voice profile by ID"""
        profile = db.query(VoiceProfile).filter(VoiceProfile.id == profile_id).first()
        if profile:
            # Add audio_path property for Chatterbox compatibility.
            # If the value is remote, download it to a local temp file for model inference.
            profile.audio_path = storage_service.resolve_to_local_path(profile.original_audio_path, expected_suffix=".wav")
        return profile
    
    def delete_profile(self, db: Session, profile_id: int, user_id: int) -> bool:
        """Delete a voice profile"""
        profile = db.query(VoiceProfile).filter(
            VoiceProfile.id == profile_id,
            VoiceProfile.owner_id == user_id
        ).first()
        
        if profile:
            # Delete audio file if exists
            storage_service.delete_reference(profile.original_audio_path, category="uploads")
            
            db.delete(profile)
            db.commit()
            return True
        return False
    
    def update_profile(
        self,
        db: Session,
        profile_id: int,
        user_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        exaggeration: Optional[float] = None,
        cfg_weight: Optional[float] = None
    ) -> Optional[VoiceProfile]:
        """Update a voice profile"""
        profile = db.query(VoiceProfile).filter(
            VoiceProfile.id == profile_id,
            VoiceProfile.owner_id == user_id
        ).first()
        
        if profile:
            if name:
                profile.name = name
            if description is not None:
                profile.description = description
            if exaggeration is not None:
                profile.pitch_shift = exaggeration
            if cfg_weight is not None:
                profile.speed_rate = cfg_weight
            
            db.commit()
            db.refresh(profile)
        
        return profile


def create_predefined_voices(db: Session):
    """Create default predefined voice profiles for Chatterbox"""
    predefined_voices = [
        {
            "name": "Default Voice", 
            "description": "Chatterbox default voice - balanced and natural",
            "exaggeration": 0.5,
            "cfg_weight": 0.5
        },
        {
            "name": "Expressive", 
            "description": "More emotional and dramatic speech",
            "exaggeration": 0.7,
            "cfg_weight": 0.3
        },
        {
            "name": "Calm & Steady", 
            "description": "Relaxed, measured pacing",
            "exaggeration": 0.3,
            "cfg_weight": 0.6
        },
        {
            "name": "Energetic", 
            "description": "Lively and upbeat delivery",
            "exaggeration": 0.8,
            "cfg_weight": 0.4
        },
        {
            "name": "Professional", 
            "description": "Clear and professional tone",
            "exaggeration": 0.4,
            "cfg_weight": 0.5
        },
        {
            "name": "Storyteller", 
            "description": "Engaging narrative style",
            "exaggeration": 0.6,
            "cfg_weight": 0.4
        },
    ]
    
    # Check if predefined voices already exist
    existing = db.query(VoiceProfile).filter(VoiceProfile.is_predefined == True).first()
    if existing:
        return
    
    for voice in predefined_voices:
        profile = VoiceProfile(
            name=voice["name"],
            description=voice["description"],
            pitch_shift=voice["exaggeration"],  # Repurposed for exaggeration
            speed_rate=voice["cfg_weight"],     # Repurposed for cfg_weight
            volume=1.0,
            is_predefined=True,
            owner_id=None
        )
        db.add(profile)
    
    db.commit()


# Singleton instance
voice_service = VoiceService()
