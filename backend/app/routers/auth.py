"""
Authentication Router - Register, Login, and Google OAuth endpoints
"""
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.database import get_db
from app.schemas.user import UserCreate, UserResponse, Token
from app.services.auth_service import AuthService, get_current_active_user
from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, settings
from app.models.user import User
from app.models.chat_history import ChatHistory
from app.models.voice_profile import VoiceProfile

router = APIRouter(prefix="/auth", tags=["Authentication"])

class GoogleAuthRequest(BaseModel):
    """Request body for Google OAuth"""
    credential: str  # Google ID token


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user.
    
    - **email**: Valid email address
    - **username**: Unique username
    - **password**: Strong password
    - **full_name**: Optional full name
    """
    # Check if user already exists
    if AuthService.get_user_by_email(db, user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    if AuthService.get_user_by_username(db, user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Create new user
    user = AuthService.create_user(
        db=db,
        email=user_data.email,
        username=user_data.username,
        password=user_data.password,
        full_name=user_data.full_name
    )
    
    # Generate access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = AuthService.create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Login and get access token.
    
    - **username**: Your username
    - **password**: Your password
    """
    user = AuthService.authenticate_user(db, form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = AuthService.create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """Get current authenticated user information"""
    return current_user


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_active_user)):
    """
    Logout user.
    
    Note: Since we're using JWT, logout is handled client-side by removing the token.
    This endpoint can be used to invalidate refresh tokens if implemented.
    """
    return {"message": "Successfully logged out"}


@router.post("/google", response_model=Token)
async def google_auth(
    auth_data: GoogleAuthRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticate with Google OAuth.
    
    - **credential**: Google ID token from frontend
    """
    try:
        # Verify Google ID token
        idinfo = id_token.verify_oauth2_token(
            auth_data.credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
        
        # Get user info from token
        email = idinfo.get('email')
        full_name = idinfo.get('name')
        google_id = idinfo.get('sub')
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not provided by Google"
            )
        
        # Create or get user
        user = AuthService.create_or_get_google_user(
            db=db,
            email=email,
            full_name=full_name,
            google_id=google_id
        )
        
        # Generate access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = AuthService.create_access_token(
            data={"sub": user.username},
            expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user
        }
        
    except ValueError as e:
        # Invalid token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )


@router.get("/google/client-id")
async def get_google_client_id():
    """Get Google Client ID for frontend"""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google OAuth not configured"
        )
    return {"client_id": settings.GOOGLE_CLIENT_ID}


@router.get("/stats")
async def get_user_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get per-user dashboard statistics"""
    # Count cloned voices (exclude predefined)
    cloned_voices = db.query(func.count(VoiceProfile.id)).filter(
        VoiceProfile.owner_id == current_user.id,
        VoiceProfile.is_predefined == False
    ).scalar() or 0

    # Count distinct chat sessions for this user
    chat_sessions = db.query(func.count(distinct(ChatHistory.session_id))).filter(
        ChatHistory.user_id == current_user.id
    ).scalar() or 0

    # TTS generations and documents processed stored as counters on user
    tts_generations = getattr(current_user, 'tts_generation_count', 0) or 0
    documents_processed = getattr(current_user, 'document_processed_count', 0) or 0

    return {
        "cloned_voices": cloned_voices,
        "tts_generations": tts_generations,
        "documents_processed": documents_processed,
        "chat_sessions": chat_sessions,
    }


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.put("/profile")
async def update_profile(
    data: UpdateProfileRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update user profile (full name, username)"""
    if data.username and data.username != current_user.username:
        existing = AuthService.get_user_by_username(db, data.username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        current_user.username = data.username

    if data.full_name is not None:
        current_user.full_name = data.full_name

    db.commit()
    db.refresh(current_user)
    return {"message": "Profile updated successfully", "user": {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
    }}


@router.put("/password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    # Google OAuth users have empty hashed_password
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password change not available for Google OAuth accounts"
        )

    if not AuthService.verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters"
        )

    current_user.hashed_password = AuthService.get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


@router.delete("/account")
async def delete_account(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete user account and all associated data"""
    from app.models.chat_history import ChatHistory as CH
    from app.models.voice_profile import VoiceProfile as VP

    # Delete chat history
    db.query(CH).filter(CH.user_id == current_user.id).delete()
    # Delete voice profiles
    db.query(VP).filter(VP.owner_id == current_user.id).delete()
    # Delete user
    db.delete(current_user)
    db.commit()
    return {"message": "Account deleted successfully"}


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload a profile picture (avatar)"""
    import uuid
    from app.services.storage_service import storage_service

    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, WebP or GIF images are allowed"
        )

    # Validate file size (max 2 MB)
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image must be smaller than 2 MB"
        )

    # Delete old avatar if it exists
    if current_user.avatar_url:
        storage_service.delete_reference(current_user.avatar_url, category="avatars")

    # Save new avatar with unique filename
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    avatar_url = storage_service.save_bytes(
        data=contents,
        filename=filename,
        category="avatars",
        content_type=file.content_type,
    )
    current_user.avatar_url = avatar_url
    db.commit()
    db.refresh(current_user)

    return {
        "message": "Avatar uploaded successfully",
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "username": current_user.username,
            "full_name": current_user.full_name,
            "avatar_url": current_user.avatar_url,
        }
    }
