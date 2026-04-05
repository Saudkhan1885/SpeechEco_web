"""
Text-to-Speech Router - Generate audio from text using Chatterbox TTS
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import json
import io

from app.database import get_db
from app.schemas.tts import (
    TTSRequest, TTSResponse, 
    VoiceConversionRequest, VoiceConversionResponse,
    ChatterboxStatusResponse
)
from app.services.auth_service import get_current_active_user
from app.services.chatterbox_service import chatterbox_service
from app.services.voice_service import voice_service
from app.services.storage_service import storage_service
from app.models.user import User

router = APIRouter(prefix="/tts", tags=["Text-to-Speech"])


@router.get("/status", response_model=ChatterboxStatusResponse)
async def get_tts_status():
    """
    Get Chatterbox TTS engine status and capabilities.
    """
    return chatterbox_service.get_model_info()


@router.post("/generate", response_model=TTSResponse)
async def generate_speech(
    request: TTSRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate speech audio from text using Chatterbox TTS.
    
    - **text**: Text to convert to speech
    - **voice_id**: Optional voice profile ID for voice cloning
    - **exaggeration**: Emotion exaggeration (0.0-1.0, default 0.5)
    - **cfg_weight**: CFG weight for pacing (0.0-1.0, default 0.5)
    - **temperature**: Generation temperature (0.1-2.0, default 0.8)
    """
    print(f"TTS Generate Request - Text length: {len(request.text) if request.text else 0}, Voice ID: {request.voice_id}")
    
    if not request.text or len(request.text.strip()) == 0:
        print("TTS Error: Text is empty")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty"
        )
    
    # No character limit - Chatterbox handles chunking automatically
    # Large documents will be split into chunks for processing
    
    if not chatterbox_service.is_available:
        print("TTS Error: Chatterbox not available")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatterbox TTS engine is not available"
        )
    
    # Get voice profile audio path for voice cloning
    audio_prompt_path = None
    
    if request.voice_id:
        profile = voice_service.get_profile_by_id(db, request.voice_id)
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Voice profile not found"
            )
        
        # Check authorization
        if profile.owner_id and profile.owner_id != current_user.id and not profile.is_predefined:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to use this voice profile"
            )
        
        # Use the stored audio file for voice cloning (cloned voices)
        audio_prompt_path = profile.audio_path
        
        print(f"[TTS] Voice ID: {request.voice_id}, Profile: {profile.name}, Audio path: {audio_prompt_path}")
        
        import os
        if audio_prompt_path:
            print(f"[TTS] File exists: {os.path.exists(audio_prompt_path)}")
        else:
            print(f"[TTS] No audio path for voice profile {request.voice_id} (using default Chatterbox voice)")
    
    try:
        print(f"[TTS] Generating with audio_prompt_path: {audio_prompt_path}")
        # Generate audio using Chatterbox
        audio_url, duration = await chatterbox_service.generate_audio_async(
            text=request.text,
            audio_prompt_path=audio_prompt_path,
            exaggeration=request.exaggeration,
            cfg_weight=request.cfg_weight,
            temperature=request.temperature
        )

        # Increment per-user TTS counter
        try:
            current_user.tts_generation_count = (current_user.tts_generation_count or 0) + 1
            db.commit()
        except Exception:
            db.rollback()
        
        return TTSResponse(
            audio_url=audio_url,
            duration=duration,
            text=request.text,
            voice_id=request.voice_id
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate speech: {str(e)}"
        )


@router.post("/generate/stream")
async def generate_speech_stream(
    request: TTSRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate speech audio from text with streaming output.
    Returns audio chunks as they are generated.
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty"
        )
    
    if not chatterbox_service.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatterbox TTS engine is not available"
        )
    
    # Get voice profile audio path for voice cloning
    audio_prompt_path = None
    
    if request.voice_id:
        profile = voice_service.get_profile_by_id(db, request.voice_id)
        if profile:
            if profile.audio_path:
                audio_prompt_path = profile.audio_path
    
    async def generate_chunks():
        try:
            for audio_bytes, metrics in chatterbox_service.generate_audio_stream(
                text=request.text,
                audio_prompt_path=audio_prompt_path,
                exaggeration=request.exaggeration,
                cfg_weight=request.cfg_weight,
                temperature=request.temperature
            ):
                yield audio_bytes
        except Exception as e:
            print(f"Streaming error: {e}")
            raise
    
    return StreamingResponse(
        generate_chunks(),
        media_type="audio/wav",
        headers={"X-Streaming": "true"}
    )


@router.post("/generate/stream-chunks")
async def generate_speech_stream_chunks(
    request: TTSRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate speech audio with real-time chunk streaming.
    
    This endpoint streams audio chunks as they are generated, allowing
    playback to start immediately without waiting for the full document.
    
    Returns Server-Sent Events (SSE) with base64-encoded audio chunks.
    Each chunk can be played immediately for zero-latency experience.
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty"
        )
    
    if not chatterbox_service.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatterbox TTS engine is not available"
        )
    
    # Get voice profile audio path for voice cloning
    audio_prompt_path = None
    if request.voice_id:
        profile = voice_service.get_profile_by_id(db, request.voice_id)
        if profile:
            if profile.audio_path:
                audio_prompt_path = profile.audio_path
    
    import base64
    
    async def stream_chunks_sse():
        """Generate Server-Sent Events with audio chunks"""
        try:
            chunk_index = 0
            total_duration = 0
            
            for audio_bytes, duration, chunk_text in chatterbox_service.generate_audio_stream_with_text(
                text=request.text,
                audio_prompt_path=audio_prompt_path,
                exaggeration=request.exaggeration,
                cfg_weight=request.cfg_weight,
                temperature=request.temperature
            ):
                # Encode audio as base64 for SSE transport
                audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                
                chunk_data = {
                    "chunk_index": chunk_index,
                    "audio_base64": audio_base64,
                    "duration": duration,
                    "text": chunk_text,
                    "total_duration": total_duration + duration,
                    "is_final": False
                }
                
                # SSE format: data: {json}\n\n
                yield f"data: {json.dumps(chunk_data)}\n\n"
                
                total_duration += duration
                chunk_index += 1
                
                # Small delay to allow frontend to process
                await asyncio.sleep(0.01)
            
            # Send final message
            final_data = {
                "chunk_index": chunk_index,
                "is_final": True,
                "total_chunks": chunk_index,
                "total_duration": total_duration
            }
            yield f"data: {json.dumps(final_data)}\n\n"
            
        except Exception as e:
            print(f"SSE streaming error: {e}")
            error_data = {"error": str(e), "is_final": True}
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        stream_chunks_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/voice-conversion", response_model=VoiceConversionResponse)
async def convert_voice(
    request: VoiceConversionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Convert voice in source audio to target voice profile.
    
    - **source_audio_url**: Path/URL to source audio file
    - **target_voice_id**: Voice profile ID to convert to
    """
    if not chatterbox_service.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatterbox voice conversion is not available"
        )
    
    # Get target voice profile
    target_profile = voice_service.get_profile_by_id(db, request.target_voice_id)
    
    if not target_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target voice profile not found"
        )
    
    # Check authorization
    if target_profile.owner_id and target_profile.owner_id != current_user.id and not target_profile.is_predefined:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to use this voice profile"
        )
    
    if not target_profile.audio_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target voice profile has no audio reference"
        )

    source_audio_path = storage_service.resolve_to_local_path(
        request.source_audio_url,
        expected_suffix=".wav"
    )
    if not source_audio_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source audio could not be resolved"
        )
    
    try:
        audio_url, duration = await chatterbox_service.voice_conversion_async(
            source_audio_path=source_audio_path,
            target_voice_path=target_profile.audio_path
        )
        
        return VoiceConversionResponse(
            audio_url=audio_url,
            duration=duration,
            source_audio_url=request.source_audio_url,
            target_voice_id=request.target_voice_id
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to convert voice: {str(e)}"
        )


@router.post("/preview")
async def preview_voice(
    voice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Generate a short preview of a voice profile using Chatterbox.
    """
    profile = voice_service.get_profile_by_id(db, voice_id)
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice profile not found"
        )
    
    if not chatterbox_service.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatterbox TTS engine is not available"
        )
    
    # Preview text
    preview_text = f"Hello, this is a preview of the {profile.name} voice profile."
    
    # Use predefined style params if no audio path
    preview_exaggeration = 0.5
    preview_cfg_weight = 0.5
    if profile.is_predefined and not profile.audio_path:
        preview_exaggeration = profile.pitch_shift
        preview_cfg_weight = profile.speed_rate
    
    try:
        audio_url, duration = await chatterbox_service.generate_audio_async(
            text=preview_text,
            audio_prompt_path=profile.audio_path,
            exaggeration=preview_exaggeration,
            cfg_weight=preview_cfg_weight
        )
        
        return {
            "audio_url": audio_url,
            "duration": duration,
            "voice_name": profile.name
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate preview: {str(e)}"
        )
