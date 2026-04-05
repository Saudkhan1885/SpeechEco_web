"""
Chat Router - Text-to-text conversational interface with Groq LLM
"""
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.chat import ChatMessage, ChatResponse
from app.services.auth_service import get_current_active_user
from app.services.chat_service import chat_service
from app.services.document_service import DocumentService
from app.models.user import User
from app.models.chat_history import ChatHistory

router = APIRouter(prefix="/chat", tags=["Chat"])

# Initialize document service
document_service = DocumentService()


# Store active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]

    async def send_message(self, message: dict, session_id: str):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(message)


manager = ConnectionManager()


@router.post("/message", response_model=ChatResponse)
async def send_message(
    message: ChatMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Send a chat message and get a text response from Groq LLM.
    
    - **message**: User's message text
    - **session_id**: Optional session ID for conversation context
    - **document_context**: Optional document text for document Q&A
    """
    # Generate session ID if not provided
    session_id = message.session_id or chat_service.generate_session_id()
    
    # Process chat with optional document context
    result = await chat_service.process_chat(
        user_message=message.message,
        session_id=session_id,
        document_context=message.document_context
    )
    
    # Save to history
    history = ChatHistory(
        session_id=session_id,
        user_message=message.message,
        assistant_response=result["text"],
        audio_url=None,
        mode="text-to-text" if not result.get("has_document") else "document-chat",
        user_id=current_user.id
    )
    db.add(history)
    db.commit()
    
    return ChatResponse(
        text=result["text"],
        session_id=session_id,
        timestamp=result["timestamp"],
        has_document=result.get("has_document", False)
    )


@router.post("/message/stream")
async def send_message_stream(
    message: ChatMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Send a chat message and get a streaming response from Groq LLM.
    
    - **message**: User's message text
    - **session_id**: Optional session ID for conversation context
    - **document_context**: Optional document text for document Q&A
    
    Returns Server-Sent Events (SSE) stream with text chunks.
    """
    from datetime import datetime
    
    # Generate session ID if not provided
    session_id = message.session_id or chat_service.generate_session_id()
    
    # Check if this session has a document attached
    has_document = chat_service.has_document_context(session_id) or bool(message.document_context)
    
    # Store document context if provided
    if message.document_context:
        chat_service.store_document_context(session_id, message.document_context)
    
    # Get document context for this session
    document_context = chat_service.get_document_context(session_id)
    
    # Build conversation history
    conversation_history = chat_service.get_conversation_history(session_id)
    
    async def event_generator():
        full_response = []
        
        try:
            # Send initial event with session info
            yield f"data: {json.dumps({'type': 'start', 'session_id': session_id, 'has_document': has_document})}\n\n"
            
            # Stream the response
            async for chunk in chat_service.get_response_stream(
                user_message=message.message,
                session_id=session_id,
                document_context=document_context
            ):
                full_response.append(chunk)
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
            
            # Store conversation in history
            complete_response = "".join(full_response)
            chat_service.add_to_history(session_id, message.message, complete_response)
            
            # Save to database
            history = ChatHistory(
                session_id=session_id,
                user_message=message.message,
                assistant_response=complete_response,
                audio_url=None,
                mode="text-to-text" if not has_document else "document-chat",
                user_id=current_user.id
            )
            db.add(history)
            db.commit()
            
            # Send completion event
            yield f"data: {json.dumps({'type': 'end', 'timestamp': datetime.now().isoformat()})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/upload-document")
async def upload_document_for_chat(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload a document (PDF or TXT) for chat context.
    
    - **file**: PDF or TXT file to upload
    - **session_id**: Optional session ID to attach document to
    
    Returns extracted text and session info.
    """
    # Validate file type
    allowed_types = ["application/pdf", "text/plain"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a PDF or TXT file."
        )
    
    # Read file content
    file_content = await file.read()
    
    # Check file size (max 10MB for chat context)
    max_size = 10 * 1024 * 1024
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size is 10MB."
        )
    
    # Extract text based on file type
    try:
        # Use the new document service API
        result = document_service.process_document(
            file_content=file_content,
            original_filename=file.filename,
            apply_nlp=True,
            remove_stopwords=False,
            optimize_for_tts=False
        )
        text = result.get('raw_text', '')
        page_count = result.get('pages_count', result.get('paragraphs_count', result.get('lines_count', 1)))
        
        if not text or len(text.strip()) == 0:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from the document."
            )
        
        # Generate or use provided session ID
        effective_session_id = session_id or chat_service.generate_session_id()
        
        # Store document context for the session
        chat_service.set_document_context(effective_session_id, text)
        
        return {
            "success": True,
            "session_id": effective_session_id,
            "filename": file.filename,
            "page_count": page_count,
            "character_count": len(text),
            "preview": text[:500] + "..." if len(text) > 500 else text
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


@router.delete("/document/{session_id}")
async def remove_document_context(
    session_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Remove document context from a chat session.
    """
    chat_service.clear_document_context(session_id)
    return {"success": True, "message": "Document context removed"}


@router.websocket("/ws/{session_id}")
async def websocket_chat(
    websocket: WebSocket,
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for real-time text chat.
    
    Message format (send):
    {
        "message": "Hello"
    }
    
    Response format (receive):
    {
        "type": "response",
        "text": "AI response",
        "timestamp": "2024-01-01T00:00:00"
    }
    """
    await manager.connect(websocket, session_id)
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            
            user_message = data.get("message", "")
            
            if not user_message:
                await manager.send_message({
                    "type": "error",
                    "message": "Empty message"
                }, session_id)
                continue
            
            # Send processing status
            await manager.send_message({
                "type": "status",
                "message": "Processing..."
            }, session_id)
            
            # Process chat
            result = await chat_service.process_chat(
                user_message=user_message,
                session_id=session_id
            )
            
            # Send response
            await manager.send_message({
                "type": "response",
                "text": result["text"],
                "timestamp": result["timestamp"]
            }, session_id)
            
    except WebSocketDisconnect:
        manager.disconnect(session_id)


@router.get("/history/{session_id}")
async def get_chat_history(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get chat history for a session.
    """
    history = db.query(ChatHistory).filter(
        ChatHistory.session_id == session_id,
        ChatHistory.user_id == current_user.id
    ).order_by(ChatHistory.created_at.asc()).all()
    
    return [
        {
            "id": h.id,
            "user_message": h.user_message,
            "assistant_response": h.assistant_response,
            "audio_url": h.audio_url,
            "mode": h.mode,
            "created_at": h.created_at
        }
        for h in history
    ]


@router.get("/sessions")
async def get_user_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all chat sessions for the current user.
    """
    sessions = db.query(ChatHistory.session_id).filter(
        ChatHistory.user_id == current_user.id
    ).distinct().all()
    
    result = []
    for (session_id,) in sessions:
        # Get first message as preview
        first_message = db.query(ChatHistory).filter(
            ChatHistory.session_id == session_id
        ).order_by(ChatHistory.created_at.asc()).first()
        
        # Get message count
        count = db.query(ChatHistory).filter(
            ChatHistory.session_id == session_id
        ).count()
        
        result.append({
            "session_id": session_id,
            "preview": first_message.user_message[:50] + "..." if len(first_message.user_message) > 50 else first_message.user_message,
            "message_count": count,
            "created_at": first_message.created_at
        })
    
    return result
