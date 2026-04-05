"""
Pydantic schemas for Chat
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None
    document_context: Optional[str] = None  # Extracted text from uploaded document


class ChatResponse(BaseModel):
    text: str
    session_id: str
    timestamp: datetime
    has_document: bool = False
