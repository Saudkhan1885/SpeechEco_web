import { createContext, useContext, useState, useCallback } from 'react'
import { chatService } from '../services/api'
import { useAuth } from './AuthContext'

const ChatContext = createContext(null)

// Smart fallback responses
const fallbackResponses = [
  "I understand what you're saying. Could you elaborate more on that topic?",
  "That's an interesting perspective. Let me share my thoughts on this.",
  "I appreciate you bringing this up. Here's what I think about it.",
  "Thank you for your question. Based on my understanding, I can help with that.",
  "That's a great point to discuss. Let me provide some insights.",
  "I hear you. Here's some relevant information that might help.",
  "Interesting thought! Let me offer my perspective on this matter.",
  "Thanks for sharing. I'd be happy to explore this topic further with you.",
  "I understand your concern. Here's what I would suggest.",
  "That's a thoughtful question. Let me give you a comprehensive answer."
]

export function ChatProvider({ children }) {
  const { token } = useAuth()
  const [messages, setMessages] = useState([])
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Document state
  const [uploadedDocument, setUploadedDocument] = useState(null)
  const [isUploadingDocument, setIsUploadingDocument] = useState(false)

  // Upload document for chat context
  const uploadDocument = async (file) => {
    setIsUploadingDocument(true)
    
    try {
      if (token) {
        const response = await chatService.uploadDocument(file, sessionId)
        const docInfo = response.data
        
        setUploadedDocument({
          filename: docInfo.filename,
          pageCount: docInfo.page_count,
          characterCount: docInfo.character_count,
          preview: docInfo.preview
        })
        
        // Update session ID if returned
        if (docInfo.session_id) {
          setSessionId(docInfo.session_id)
        }
        
        // Add system message about document upload
        const systemMessage = {
          id: Date.now(),
          type: 'system',
          text: `📄 Document "${docInfo.filename}" uploaded successfully (${docInfo.page_count} page${docInfo.page_count > 1 ? 's' : ''}, ${docInfo.character_count.toLocaleString()} characters). You can now ask questions about this document.`,
          timestamp: new Date().toISOString()
        }
        setMessages(prev => [...prev, systemMessage])
        
        return { success: true, document: docInfo }
      } else {
        // Mock document upload
        await new Promise(resolve => setTimeout(resolve, 1000))
        const mockDoc = {
          filename: file.name,
          pageCount: 1,
          characterCount: 1000,
          preview: "This is a mock document preview..."
        }
        setUploadedDocument(mockDoc)
        
        const systemMessage = {
          id: Date.now(),
          type: 'system',
          text: `📄 Document "${file.name}" uploaded. You can now ask questions about this document.`,
          timestamp: new Date().toISOString()
        }
        setMessages(prev => [...prev, systemMessage])
        
        return { success: true, document: mockDoc }
      }
    } catch (error) {
      console.error('Document upload error:', error)
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Failed to upload document' 
      }
    } finally {
      setIsUploadingDocument(false)
    }
  }

  // Remove document from chat
  const removeDocument = async () => {
    try {
      if (token) {
        await chatService.removeDocument(sessionId)
      }
      setUploadedDocument(null)
      
      const systemMessage = {
        id: Date.now(),
        type: 'system',
        text: '📄 Document removed from chat context.',
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, systemMessage])
      
      return { success: true }
    } catch (error) {
      console.error('Document removal error:', error)
      return { success: false, error: error.message }
    }
  }

  const sendMessage = async (text) => {
    // Add user message
    const userMessage = {
      id: Date.now(),
      type: 'user',
      text,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])
    setIsProcessing(true)

    // Create assistant message placeholder for streaming
    const assistantMessageId = Date.now() + 1
    const assistantMessage = {
      id: assistantMessageId,
      type: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      hasDocument: false
    }
    setMessages(prev => [...prev, assistantMessage])

    try {
      if (token) {
        // Buffer for incoming chunks and controlled rendering
        let textBuffer = ''
        let displayedText = ''
        let isComplete = false
        let completionResult = null
        
        // Typing speed control (characters per render, delay between renders)
        const CHARS_PER_TICK = 8  // Characters to add per tick
        const TICK_DELAY = 15     // Milliseconds between ticks
        
        // Start the typing animation loop
        const typeText = async () => {
          while (!isComplete || displayedText.length < textBuffer.length) {
            if (displayedText.length < textBuffer.length) {
              // Add characters from buffer
              const charsToAdd = Math.min(CHARS_PER_TICK, textBuffer.length - displayedText.length)
              displayedText = textBuffer.slice(0, displayedText.length + charsToAdd)
              
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                  ? { ...msg, text: displayedText }
                  : msg
              ))
            }
            await new Promise(resolve => setTimeout(resolve, TICK_DELAY))
          }
          
          // Finish up - mark as complete
          if (completionResult) {
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, isStreaming: false, hasDocument: completionResult.hasDocument, timestamp: completionResult.timestamp }
                : msg
            ))
            if (completionResult.sessionId) {
              setSessionId(completionResult.sessionId)
            }
          }
          setIsProcessing(false)
        }
        
        // Start typing animation
        const typingPromise = typeText()
        
        // Use streaming API with Groq LLM
        await chatService.sendMessageStream(
          text,
          sessionId,
          null, // Document context is stored on server side
          // onChunk callback - add to buffer
          (chunk) => {
            textBuffer += chunk
          },
          // onComplete callback
          (result) => {
            isComplete = true
            completionResult = result
          },
          // onError callback
          (error) => {
            console.error('Streaming error:', error)
            isComplete = true
            textBuffer = 'Sorry, I encountered an error. Please try again.'
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, text: textBuffer, isStreaming: false, type: 'error' }
                : msg
            ))
            setIsProcessing(false)
          }
        )
        
        // Wait for typing to complete
        await typingPromise
        
        return { success: true }
      } else {
        // Mock response when not logged in with simulated streaming
        const responseText = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)]
        
        // Simulate streaming by sending characters with natural pace
        for (let i = 0; i < responseText.length; i += 2) {
          await new Promise(resolve => setTimeout(resolve, 30))
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, text: responseText.slice(0, i + 2) }
              : msg
          ))
        }
        
        // Mark streaming as complete
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, isStreaming: false }
            : msg
        ))
        setIsProcessing(false)
        
        return { success: true }
      }
    } catch (error) {
      console.error('Chat error:', error)
      
      // Update the assistant message to show error
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, text: 'Sorry, I encountered an error. Please try again.', isStreaming: false, type: 'error' }
          : msg
      ))
      setIsProcessing(false)
      
      return { success: false, error: error.message }
    }
  }

  // Add messages from voice conversation directly to history (no API call)
  const addVoiceMessages = useCallback((userText, assistantText) => {
    const timestamp = new Date().toISOString()
    
    // Add user message
    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: userText,
      timestamp,
      isVoice: true
    }
    
    // Add assistant message
    const assistantMessage = {
      id: Date.now() + 1,
      type: 'assistant',
      text: assistantText,
      timestamp,
      isStreaming: false,
      isVoice: true
    }
    
    setMessages(prev => [...prev, userMessage, assistantMessage])
  }, [])

  const clearChat = () => {
    setMessages([])
    setSessionId(`session-${Date.now()}`)
    setUploadedDocument(null)
  }

  const value = {
    messages,
    sessionId,
    isProcessing,
    uploadedDocument,
    isUploadingDocument,
    sendMessage,
    addVoiceMessages,
    uploadDocument,
    removeDocument,
    clearChat
  }

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
