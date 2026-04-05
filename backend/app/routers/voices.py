"""
Voice Cloning Router - Manage voice profiles
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.voice_profile import VoiceProfileResponse, VoiceProfileUpdate
from app.services.auth_service import get_current_active_user
from app.services.voice_service import voice_service
from app.models.user import User

router = APIRouter(prefix="/voices", tags=["Voice Cloning"])


@router.post("/clone", response_model=VoiceProfileResponse, status_code=status.HTTP_201_CREATED)
async def clone_voice(
    name: str = Form(...),
    description: str = Form(None),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Clone a voice from an audio sample.
    
    - **name**: Name for the cloned voice profile
    - **description**: Optional description
    - **audio_file**: Audio file (WAV, MP3, M4A, FLAC, OGG, etc.)
    
    Note: For best results, use 3-10 seconds of clear audio.
    """
    # Validate file type - accept all audio formats
    allowed_types = [
        "audio/wav", "audio/x-wav", "audio/wave",
        "audio/mpeg", "audio/mp3", "audio/mp4", 
        "audio/m4a", "audio/x-m4a", "audio/aac",
        "audio/ogg", "audio/vorbis", "audio/opus",
        "audio/flac", "audio/x-flac",
        "audio/webm", "audio/wma", "audio/aiff",
        "audio/basic", "audio/x-aiff"
    ]
    
    # Check if content type starts with 'audio/' or is in allowed list
    is_audio = (
        audio_file.content_type and (
            audio_file.content_type.startswith("audio/") or 
            audio_file.content_type in allowed_types
        )
    )
    
    # Also check file extension as fallback
    if not is_audio and audio_file.filename:
        audio_extensions = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.webm', '.wma', '.aiff', '.opus']
        is_audio = any(audio_file.filename.lower().endswith(ext) for ext in audio_extensions)
    
    if not is_audio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Please upload an audio file (WAV, MP3, M4A, FLAC, OGG, etc.)"
        )
    
    # Read file content
    file_content = await audio_file.read()
    
    # Save audio file
    audio_path = voice_service.save_audio_file(file_content, audio_file.filename)
    
    # Validate audio duration
    is_valid, duration, error_msg = voice_service.validate_audio_duration(audio_path)
    if not is_valid:
        # Cleanup file on validation failure
        import os
        os.remove(audio_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Create voice profile with random parameters
    voice_profile = voice_service.create_voice_profile(
        db=db,
        name=name,
        owner_id=current_user.id,
        audio_path=audio_path,
        audio_duration=duration,
        description=description
    )
    
    return voice_profile


@router.get("/", response_model=List[VoiceProfileResponse])
async def get_all_voices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all voice profiles (user's cloned voices + predefined voices).
    """
    return voice_service.get_user_profiles(db, current_user.id)


@router.get("/predefined", response_model=List[VoiceProfileResponse])
async def get_predefined_voices(db: Session = Depends(get_db)):
    """
    Get all predefined voice profiles (no authentication required).
    """
    return voice_service.get_predefined_voices(db)


@router.get("/{voice_id}", response_model=VoiceProfileResponse)
async def get_voice_profile(
    voice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a specific voice profile by ID.
    """
    profile = voice_service.get_profile_by_id(db, voice_id)
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice profile not found"
        )
    
    # Check ownership or if predefined
    if profile.owner_id != current_user.id and not profile.is_predefined:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this voice profile"
        )
    
    return profile


@router.patch("/{voice_id}", response_model=VoiceProfileResponse)
async def update_voice_profile(
    voice_id: int,
    update_data: VoiceProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update a voice profile.
    """
    profile = voice_service.get_profile_by_id(db, voice_id)
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice profile not found"
        )
    
    if profile.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this voice profile"
        )
    
    # Update fields
    for field, value in update_data.dict(exclude_unset=True).items():
        setattr(profile, field, value)
    
    db.commit()
    db.refresh(profile)
    
    return profile


@router.delete("/{voice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_voice_profile(
    voice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete a voice profile.
    """
    success = voice_service.delete_profile(db, voice_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice profile not found or not authorized"
        )
