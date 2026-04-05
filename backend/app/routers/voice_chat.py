"""
Voice Chat Router - Real-time voice-to-voice conversation endpoints
Provides ChatGPT-like voice conversation experience
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
import json
import asyncio
import os

from app.database import get_db
from app.services.auth_service import get_current_active_user
from app.services.voice_chat_service import voice_chat_service
from app.services.stt_service import stt_service
from app.services.voice_service import voice_service
from app.models.user import User

router = APIRouter(prefix="/voice-chat", tags=["Voice Chat"])


# Supported audio formats
SUPPORTED_AUDIO_FORMATS = {
    'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/webm', 'audio/webm;codecs=opus',
    'audio/mp3', 'audio/mpeg',
    'audio/ogg', 'audio/ogg;codecs=opus',
    'audio/mp4', 'audio/m4a',
    'audio/flac',
    'application/octet-stream'  # Sometimes browsers send this
}


@router.get("/status")
async def get_voice_chat_status():
    """
    Get voice chat service status including STT and TTS availability.
    """
    return voice_chat_service.get_status()


@router.post("/session")
async def create_voice_session(
    voice_id: Optional[int] = None,
    language: str = Query("en", description="Preferred language for STT"),
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a new voice chat session.
    
    - **voice_id**: Optional voice profile ID for personalized TTS
    - **language**: Preferred language code (e.g., 'en', 'es', 'zh')
    """
    session_id = voice_chat_service.create_session(
        user_id=current_user.id,
        voice_id=voice_id
    )
    
    if language:
        voice_chat_service.set_session_language(session_id, language)
    
    return {
        "session_id": session_id,
        "voice_id": voice_id,
        "language": language,
        "message": "Voice chat session created"
    }


@router.post("/message")
async def send_voice_message(
    audio: UploadFile = File(..., description="Audio file from user microphone"),
    session_id: Optional[str] = Query(None, description="Voice chat session ID"),
    voice_id: Optional[int] = Query(None, description="Voice profile ID for response"),
    text_only: bool = Query(False, description="Return text response only, skip TTS"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Send a voice message and receive a voice response.
    
    This is the main endpoint for voice-to-voice conversation:
    1. Uploads user's voice recording
    2. Transcribes to text using Whisper
    3. Generates AI response using LLM
    4. Converts response to speech using Chatterbox TTS
    
    **Audio Requirements:**
    - Supported formats: WAV, WebM, MP3, OGG, M4A, FLAC
    - Max size: 25MB
    - Recommended: 16kHz sample rate, mono
    
    **Returns:**
    - `user_text`: What the user said (transcription)
    - `assistant_text`: AI's text response
    - `audio_url`: URL to the voice response audio
    - `audio_duration`: Duration of voice response
    - `processing_time`: Total processing time
    """
    # Validate audio file
    if not audio.content_type or not any(
        audio.content_type.startswith(fmt.split(';')[0]) 
        for fmt in SUPPORTED_AUDIO_FORMATS
    ):
        # Allow it anyway but log warning
        print(f"Warning: Unexpected audio content type: {audio.content_type}")
    
    # Read audio content
    audio_bytes = await audio.read()
    
    # Validate size (25MB max)
    max_size = 25 * 1024 * 1024
    if len(audio_bytes) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Audio file too large. Maximum size is {max_size // (1024*1024)}MB"
        )
    
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is empty"
        )
    
    # Determine format from content type or filename
    audio_format = "wav"
    if audio.content_type:
        if "webm" in audio.content_type:
            audio_format = "webm"
        elif "mp3" in audio.content_type or "mpeg" in audio.content_type:
            audio_format = "mp3"
        elif "ogg" in audio.content_type:
            audio_format = "ogg"
        elif "m4a" in audio.content_type or "mp4" in audio.content_type:
            audio_format = "m4a"
        elif "flac" in audio.content_type:
            audio_format = "flac"
    
    # Get voice profile audio prompt if available
    audio_prompt_path = None
    if voice_id:
        profile = voice_service.get_profile_by_id(db, voice_id)
        if profile:
            if profile.audio_path:
                audio_prompt_path = profile.audio_path
                print(f"[VoiceChat] Voice ID: {voice_id}, Profile: {profile.name}, Audio path: {audio_prompt_path}")
                print(f"[VoiceChat] File exists: {os.path.exists(audio_prompt_path)}")
        else:
            print(f"[VoiceChat] Voice ID: {voice_id}, Profile not found")
    
    # Create session if not provided
    if not session_id:
        session_id = voice_chat_service.create_session(
            user_id=current_user.id,
            voice_id=voice_id
        )
    
    try:
        result = await voice_chat_service.process_voice_input(
            audio_bytes=audio_bytes,
            session_id=session_id,
            audio_format=audio_format,
            voice_id=voice_id,
            audio_prompt_path=audio_prompt_path,
            return_text_only=text_only
        )
        
        return result
        
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/message/stream")
async def send_voice_message_streaming(
    audio: UploadFile = File(...),
    session_id: Optional[str] = Query(None),
    voice_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Send a voice message with streaming response updates.
    
    Returns Server-Sent Events (SSE) with progress updates:
    - stt_start: Started speech recognition
    - stt_complete: Transcription finished
    - llm_start: Started generating response
    - llm_chunk: Response text chunk
    - tts_chunk: Base64-encoded WAV audio for one sentence (play immediately)
    - llm_complete: Full response text
    - complete: All done
    - error: An error occurred
    """
    audio_bytes = await audio.read()
    
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is empty"
        )
    
    audio_format = "wav"
    if audio.content_type and "webm" in audio.content_type:
        audio_format = "webm"
    
    # Get voice profile audio prompt
    audio_prompt_path = None
    if voice_id:
        profile = voice_service.get_profile_by_id(db, voice_id)
        if profile:
            if profile.audio_path:
                audio_prompt_path = profile.audio_path
                print(f"[VoiceChatStream] Voice ID: {voice_id}, Profile: {profile.name}, Audio path: {audio_prompt_path}")
        else:
            print(f"[VoiceChatStream] Voice ID: {voice_id}, Profile not found")
    
    if not session_id:
        session_id = voice_chat_service.create_session(
            user_id=current_user.id,
            voice_id=voice_id
        )
    
    async def generate_events():
        async for event in voice_chat_service.process_voice_input_streaming(
            audio_bytes=audio_bytes,
            session_id=session_id,
            audio_format=audio_format,
            voice_id=voice_id,
            audio_prompt_path=audio_prompt_path
        ):
            yield f"data: {json.dumps(event)}\n\n"
    
    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = Query(None, description="Language code (auto-detect if not specified)"),
    current_user: User = Depends(get_current_active_user)
):
    """
    Transcribe audio to text only (no AI response).
    
    Useful for:
    - Voice-to-text input
    - Testing microphone setup
    - Getting transcription for other purposes
    """
    audio_bytes = await audio.read()
    
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is empty"
        )
    
    audio_format = "wav"
    if audio.content_type:
        if "webm" in audio.content_type:
            audio_format = "webm"
        elif "mp3" in audio.content_type:
            audio_format = "mp3"
    
    try:
        result = await voice_chat_service.transcribe_only_async(
            audio_bytes=audio_bytes,
            audio_format=audio_format,
            language=language
        )
        
        return {
            "text": result["text"],
            "language": result.get("language", "unknown"),
            "language_probability": result.get("language_probability", 0),
            "duration": result.get("duration", 0),
            "segments": result.get("segments", [])
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(e)}"
        )


@router.get("/stt/status")
async def get_stt_status():
    """Get Speech-to-Text service status"""
    return stt_service.get_model_info()


@router.get("/stt/languages")
async def get_supported_languages():
    """Get list of supported languages for STT"""
    info = stt_service.get_model_info()
    return {
        "languages": info.get("supported_languages", []),
        "total": len(info.get("supported_languages", []))
    }


@router.delete("/session/{session_id}")
async def delete_voice_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Delete a voice chat session"""
    session = voice_chat_service.get_session(session_id)
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    # Verify ownership
    if session.get("user_id") != current_user.id and session.get("user_id") != 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this session"
        )
    
    voice_chat_service.cleanup_session(session_id)
    
    return {"message": "Session deleted", "session_id": session_id}


@router.websocket("/ws/{session_id}")
async def voice_chat_websocket(
    websocket: WebSocket,
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for real-time voice chat.
    
    Protocol:
    1. Client connects to WebSocket
    2. Client sends binary audio data
    3. Server processes and sends back JSON events
    4. Server sends audio response URL when ready
    
    Events from server:
    - {"type": "connected", "session_id": "..."}
    - {"type": "processing", "stage": "stt|llm|tts"}
    - {"type": "transcription", "text": "..."}
    - {"type": "response_text", "text": "..."}
    - {"type": "response_audio", "audio_url": "...", "duration": ...}
    - {"type": "error", "message": "..."}
    """
    await websocket.accept()
    
    # Get or create session
    session = voice_chat_service.get_session(session_id)
    if not session:
        session_id = voice_chat_service.create_session(user_id=0)
    
    await websocket.send_json({
        "type": "connected",
        "session_id": session_id,
        "message": "Voice chat ready"
    })
    
    try:
        while True:
            # Receive audio data
            data = await websocket.receive_bytes()
            
            if len(data) == 0:
                continue
            
            # Send processing start
            await websocket.send_json({
                "type": "processing",
                "stage": "stt"
            })
            
            try:
                # Process voice input
                async for event in voice_chat_service.process_voice_input_streaming(
                    audio_bytes=data,
                    session_id=session_id,
                    audio_format="webm"
                ):
                    # Map events to WebSocket messages
                    if event["type"] == "stt_complete":
                        await websocket.send_json({
                            "type": "transcription",
                            "text": event["text"]
                        })
                        await websocket.send_json({
                            "type": "processing",
                            "stage": "llm"
                        })
                    elif event["type"] == "llm_chunk":
                        await websocket.send_json({
                            "type": "response_chunk",
                            "content": event["content"]
                        })
                    elif event["type"] == "llm_complete":
                        await websocket.send_json({
                            "type": "response_text",
                            "text": event["text"]
                        })
                        await websocket.send_json({
                            "type": "processing",
                            "stage": "tts"
                        })
                    elif event["type"] == "tts_complete":
                        await websocket.send_json({
                            "type": "response_audio",
                            "audio_url": event["audio_url"],
                            "duration": event["duration"]
                        })
                    elif event["type"] == "error":
                        await websocket.send_json({
                            "type": "error",
                            "message": event.get("message", "Unknown error")
                        })
                    elif event["type"] == "complete":
                        await websocket.send_json({
                            "type": "complete",
                            "user_text": event["user_text"],
                            "assistant_text": event["assistant_text"]
                        })
                        
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
                
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass
