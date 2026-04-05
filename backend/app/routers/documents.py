"""
Document Router - Multi-format document upload and NLP-enhanced text extraction
Supports: PDF, DOCX, PPTX, TXT with up to 100MB file size
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
from pathlib import Path

from app.database import get_db
from app.services.auth_service import get_current_active_user
from app.services.document_service import DocumentService
from app.services.tts_service import tts_service
from app.services.voice_service import voice_service
from app.models.user import User

router = APIRouter(prefix="/documents", tags=["Documents"])

# Initialize document service
document_service = DocumentService()

# Supported MIME types for validation
ALLOWED_MIME_TYPES = {
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'application/octet-stream',  # Sometimes browsers send this
}

ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.pptx', '.ppt', '.txt'}

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


def validate_file(file: UploadFile) -> None:
    """Validate uploaded file"""
    # Check file extension
    ext = Path(file.filename).suffix.lower() if file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    apply_nlp: bool = Form(True),
    remove_stopwords: bool = Form(False),
    optimize_for_tts: bool = Form(True),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Upload a document and extract text with optional NLP preprocessing.
    
    Supported formats: PDF, DOCX, PPTX, TXT (up to 100MB)
    
    - **file**: Document file to upload
    - **apply_nlp**: Apply NLP preprocessing (default: True)
    - **remove_stopwords**: Remove common stop words (default: False)
    - **optimize_for_tts**: Optimize text for TTS output (default: True)
    
    Returns extracted text, statistics, and optional entity extraction.
    """
    # Validate file
    validate_file(file)
    
    # Read file content
    content = await file.read()
    
    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE / 1024 / 1024}MB"
        )
    
    try:
        # Process document
        result = document_service.process_document(
            file_content=content,
            original_filename=file.filename,
            apply_nlp=apply_nlp,
            remove_stopwords=remove_stopwords,
            optimize_for_tts=optimize_for_tts
        )

        # Increment per-user document counter
        try:
            current_user.document_processed_count = (current_user.document_processed_count or 0) + 1
            db.add(current_user)
            db.commit()
        except Exception:
            db.rollback()

        return JSONResponse(content=result)
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process document: {str(e)}"
        )


@router.post("/convert")
async def convert_to_audio(
    text: str,
    voice_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Convert text to audio using TTS.
    
    - **text**: Text to convert to speech
    - **voice_id**: Optional voice profile ID for cloned voice
    
    Returns audio URL.
    """
    if not text or not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text is required"
        )
    
    # Get voice audio path if voice_id provided
    voice_audio_path = None
    if voice_id:
        voice_profile = voice_service.get_voice_profile(db, voice_id, current_user.id)
        if voice_profile and voice_profile.audio_file_path:
            voice_audio_path = voice_profile.audio_file_path
    
    try:
        # Generate speech
        audio_path = tts_service.generate_speech(
            text=text.strip(),
            voice_audio_path=voice_audio_path
        )
        
        # Create URL for the audio
        audio_url = f"/static/audio/{Path(audio_path).name}"
        
        return {
            "audio_url": audio_url,
            "text_length": len(text),
            "voice_id": voice_id
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate audio: {str(e)}"
        )


@router.get("/supported-formats")
async def get_supported_formats():
    """
    Get list of supported document formats and their availability.
    """
    return DocumentService.get_supported_formats()
