"""
Chat Service - LLM integration with Groq API
"""
import os
import uuid
import httpx
from typing import Optional, List, Dict
from datetime import datetime

from app.config import settings


class ChatService:
    """Chat service using Groq API for conversational AI"""
    
    def __init__(self):
        self.api_key = getattr(settings, 'GROQ_API_KEY', None) or os.getenv('GROQ_API_KEY')
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        self.model = "llama-3.3-70b-versatile"  # Groq's fast LLM
        
        if not self.api_key:
            print("Warning: GROQ_API_KEY not set. Using fallback responses.")
        
        # Fallback responses when Groq is not available
        self.fallback_responses = [
            "I understand. Could you tell me more about that?",
            "That's an interesting point. Let me think about it.",
            "I see what you mean. Here's my perspective on this.",
            "Thank you for sharing that. How can I help you further?",
            "That's a great question. Let me explain.",
            "I appreciate your input. Is there anything specific you'd like to know?",
            "Understood. Let me provide some information on that topic.",
            "That's thought-provoking. What else would you like to discuss?",
            "I hear you. Let me offer some suggestions.",
            "Interesting! Tell me more about what you're looking for."
        ]
        self._fallback_index = 0
        
        # Conversation history for context
        self._conversations: Dict[str, List[Dict]] = {}
        
        # Document context storage per session
        self._document_contexts: Dict[str, str] = {}
    
    def set_document_context(self, session_id: str, document_text: str):
        """Store document context for a session"""
        self._document_contexts[session_id] = document_text
    
    def get_document_context(self, session_id: str) -> Optional[str]:
        """Get document context for a session"""
        return self._document_contexts.get(session_id)
    
    def clear_document_context(self, session_id: str):
        """Clear document context for a session"""
        if session_id in self._document_contexts:
            del self._document_contexts[session_id]
    
    def _build_system_prompt(self, document_context: Optional[str] = None) -> str:
        """Build system prompt, optionally including document context"""
        base_prompt = """You are SpeechEcho, a helpful and friendly AI assistant. 
You provide clear, concise, and helpful responses. Be conversational and engaging.
If you don't know something, admit it honestly."""
        
        if document_context:
            # Truncate document if too long (keep ~8000 chars to leave room for conversation)
            max_doc_length = 8000
            truncated_doc = document_context[:max_doc_length]
            if len(document_context) > max_doc_length:
                truncated_doc += "\n\n[Document truncated due to length...]"
            
            document_prompt = f"""{base_prompt}

The user has uploaded a document for discussion. Here is the document content:

---DOCUMENT START---
{truncated_doc}
---DOCUMENT END---

Instructions for handling document queries:
1. Answer questions about the document accurately based on its content
2. If asked about something not in the document, say so clearly
3. You can summarize, explain, analyze, or discuss any part of the document
4. Quote relevant parts of the document when helpful
5. If the user asks something unrelated to the document, you can still help with general questions
6. Be helpful and provide insightful analysis when asked"""
            
            return document_prompt
        
        return base_prompt
    
    async def get_response(
        self,
        user_message: str,
        session_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        document_context: Optional[str] = None
    ) -> str:
        """
        Get response from Groq LLM.
        
        Args:
            user_message: User's input message
            session_id: Session ID for conversation context
            system_prompt: Optional custom system prompt
            document_context: Optional document text for context
            
        Returns:
            AI response text
        """
        if not self.api_key:
            return self._get_fallback_response()
        
        try:
            # Build messages with conversation history
            messages = []
            
            # Check for stored document context if not provided directly
            effective_document = document_context
            if not effective_document and session_id:
                effective_document = self.get_document_context(session_id)
            
            # Build system prompt (with or without document)
            final_system_prompt = system_prompt or self._build_system_prompt(effective_document)
            
            messages.append({
                "role": "system",
                "content": final_system_prompt
            })
            
            # Add conversation history if available
            if session_id and session_id in self._conversations:
                # Keep last 10 messages for context
                history = self._conversations[session_id][-10:]
                messages.extend(history)
            
            # Add current user message
            messages.append({
                "role": "user",
                "content": user_message
            })
            
            # Make API request
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self.api_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": 0.7,
                        "max_tokens": 2048,  # Increased for document responses
                        "top_p": 1,
                        "stream": False
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    assistant_message = data["choices"][0]["message"]["content"]
                    
                    # Store in conversation history
                    if session_id:
                        if session_id not in self._conversations:
                            self._conversations[session_id] = []
                        self._conversations[session_id].append({
                            "role": "user",
                            "content": user_message
                        })
                        self._conversations[session_id].append({
                            "role": "assistant", 
                            "content": assistant_message
                        })
                    
                    return assistant_message
                else:
                    print(f"Groq API error: {response.status_code} - {response.text}")
                    return self._get_fallback_response()
                    
        except Exception as e:
            print(f"Groq API error: {e}")
            return self._get_fallback_response()
    
    def _get_fallback_response(self) -> str:
        """Get a fallback response when Groq is not available"""
        response = self.fallback_responses[self._fallback_index]
        self._fallback_index = (self._fallback_index + 1) % len(self.fallback_responses)
        return response
    
    async def get_response_stream(
        self,
        user_message: str,
        session_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        document_context: Optional[str] = None
    ):
        """
        Get streaming response from Groq LLM.
        
        Yields:
            Chunks of response text
        """
        if not self.api_key:
            yield self._get_fallback_response()
            return
        
        try:
            messages = []
            
            # Check for stored document context
            effective_document = document_context
            if not effective_document and session_id:
                effective_document = self.get_document_context(session_id)
            
            # Build system prompt
            final_system_prompt = system_prompt or self._build_system_prompt(effective_document)
            messages.append({"role": "system", "content": final_system_prompt})
            
            # Add conversation history
            if session_id and session_id in self._conversations:
                history = self._conversations[session_id][-10:]
                messages.extend(history)
            
            messages.append({"role": "user", "content": user_message})
            
            full_response = ""
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    self.api_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": 0.7,
                        "max_tokens": 2048,
                        "top_p": 1,
                        "stream": True
                    }
                ) as response:
                    if response.status_code == 200:
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                data = line[6:]
                                if data == "[DONE]":
                                    break
                                try:
                                    import json
                                    chunk = json.loads(data)
                                    if "choices" in chunk and len(chunk["choices"]) > 0:
                                        delta = chunk["choices"][0].get("delta", {})
                                        content = delta.get("content", "")
                                        if content:
                                            full_response += content
                                            yield content
                                except:
                                    pass
                    else:
                        yield self._get_fallback_response()
                        return
                
        except Exception as e:
            print(f"Groq streaming error: {e}")
            yield self._get_fallback_response()
    
    async def process_chat(
        self,
        user_message: str,
        session_id: Optional[str] = None,
        document_context: Optional[str] = None
    ) -> dict:
        """
        Process chat message and generate text response.
        
        Args:
            user_message: User's input
            session_id: Optional session ID for context
            document_context: Optional document text for context
            
        Returns:
            Dict with text response
        """
        # Generate session ID if not provided
        if not session_id:
            session_id = self.generate_session_id()
        
        # Store document context for the session if provided
        if document_context:
            self.set_document_context(session_id, document_context)
        
        # Check if session has document context
        has_document = self.get_document_context(session_id) is not None
        
        # Get text response from LLM (document context is retrieved from storage)
        text_response = await self.get_response(user_message, session_id)
        
        result = {
            "text": text_response,
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "has_document": has_document
        }
        
        return result
    
    def generate_session_id(self) -> str:
        """Generate unique session ID for chat"""
        return str(uuid.uuid4())
    
    def has_document_context(self, session_id: str) -> bool:
        """Check if session has document context"""
        return session_id in self._document_contexts
    
    def store_document_context(self, session_id: str, document_text: str):
        """Store document context for a session (alias for set_document_context)"""
        self._document_contexts[session_id] = document_text
    
    def get_conversation_history(self, session_id: str) -> List[Dict]:
        """Get conversation history for a session"""
        return self._conversations.get(session_id, [])
    
    def add_to_history(self, session_id: str, user_message: str, assistant_message: str):
        """Add a message exchange to conversation history"""
        if session_id not in self._conversations:
            self._conversations[session_id] = []
        self._conversations[session_id].append({"role": "user", "content": user_message})
        self._conversations[session_id].append({"role": "assistant", "content": assistant_message})
    
    def clear_conversation(self, session_id: str):
        """Clear conversation history and document context for a session"""
        if session_id in self._conversations:
            del self._conversations[session_id]
        self.clear_document_context(session_id)


# Singleton instance
chat_service = ChatService()
