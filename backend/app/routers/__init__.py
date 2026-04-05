from app.routers.auth import router as auth_router
from app.routers.voices import router as voices_router
from app.routers.tts import router as tts_router
from app.routers.documents import router as documents_router
from app.routers.chat import router as chat_router

__all__ = [
    "auth_router",
    "voices_router", 
    "tts_router",
    "documents_router",
    "chat_router"
]
