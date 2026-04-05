import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { 
  Send, Mic, MicOff, Trash2, Loader2, Bot, User, FileText, X, FileUp, 
  AlertCircle, Volume2, Square, Sparkles, MessageSquare, Settings2, ChevronDown
} from 'lucide-react'
import { useChat } from '../contexts/ChatContext'
import { useVoice } from '../contexts/VoiceContext'
import { ttsService, voiceChatService } from '../services/api'
import VoiceConversation from '../components/VoiceConversation'

// Check if Web Speech API is available
const isSpeechRecognitionSupported = () => {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

// Markdown components for rendering AI responses
const MarkdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="ml-2">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ inline, children }) => inline ? (
    <code className="bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
  ) : (
    <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg overflow-x-auto my-2">
      <code className="text-sm font-mono">{children}</code>
    </pre>
  ),
  pre: ({ children }) => <div className="my-2">{children}</div>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2 text-gray-600">{children}</blockquote>
  ),
  h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">{children}</a>
  ),
}

// Audio level visualizer component
const AudioLevelIndicator = ({ level }) => {
  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => {
        const threshold = (i + 1) * 20
        const isActive = level >= threshold
        return (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-75 ${
              isActive 
                ? i < 2 ? 'bg-green-500' : i < 4 ? 'bg-yellow-500' : 'bg-red-500'
                : 'bg-gray-300'
            }`}
            style={{ height: `${6 + i * 3}px` }}
          />
        )
      })}
    </div>
  )
}

export default function Chat() {
  const { 
    messages, 
    isProcessing, 
    sendMessage, 
    addVoiceMessages,
    clearChat, 
    uploadedDocument, 
    isUploadingDocument, 
    uploadDocument, 
    removeDocument 
  } = useChat()
  
  const { clonedVoices, selectedVoice, setSelectedVoice } = useVoice()
  
  // Input state
  const [inputText, setInputText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)
  const [recordingDuration, setRecordingDuration] = useState(0)
  
  // Voice mode: 'webapi' for Chrome, 'recording' for Firefox/others
  const [voiceMode] = useState(() => isSpeechRecognitionSupported() ? 'webapi' : 'recording')
  
  // UI state
  const [uploadError, setUploadError] = useState('')
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [currentPlayingId, setCurrentPlayingId] = useState(null)
  const [showVoiceConversation, setShowVoiceConversation] = useState(false)
  
  // Refs
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const audioRef = useRef(null)
  const recognitionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const streamRef = useRef(null)
  const recordingTimerRef = useRef(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize speech recognition (only for Chrome/browsers that support it)
  useEffect(() => {
    if (voiceMode === 'webapi' && isSpeechRecognitionSupported()) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'
      
      recognitionRef.current.onresult = (event) => {
        let interim = ''
        let final = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            final += transcript + ' '
          } else {
            interim += transcript
          }
        }
        
        if (final) {
          setInputText(prev => (prev + ' ' + final).trim())
          setInterimTranscript('')
        } else {
          setInterimTranscript(interim)
        }
      }
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setUploadError(`Voice recognition error: ${event.error}`)
        }
        stopListeningWebAPI()
      }
      
      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          // Ignore
        }
      }
    }
  }, [voiceMode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [])

  // Format recording duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // ============= WEB SPEECH API MODE (Chrome) =============
  const startListeningWebAPI = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      streamRef.current = stream
      
      // Set up audio analysis for level meter
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 256
      
      // Monitor audio levels - use ref check instead of state
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      const updateLevel = () => {
        if (analyserRef.current && streamRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setAudioLevel(Math.min(100, average * 1.5))
          animationFrameRef.current = requestAnimationFrame(updateLevel)
        }
      }
      
      // Start recognition first, then set state
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start()
        } catch (e) {
          // May already be started, ignore
          console.log('Recognition start warning:', e.message)
        }
      }
      setIsListening(true)
      setUploadError('')
      updateLevel()
      
    } catch (err) {
      console.error('Microphone access error:', err)
      setUploadError('Microphone access denied. Please allow microphone access.')
      throw err // Re-throw so toggleVoiceInput can catch it
    }
  }, [])

  const stopListeningWebAPI = useCallback(() => {
    setIsListening(false)
    setAudioLevel(0)
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        // Already stopped
      }
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  // ============= RECORDING MODE (Firefox/fallback) =============
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      })
      streamRef.current = stream
      
      // Set up audio analysis for level meter
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 256
      
      // Monitor audio levels
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setAudioLevel(Math.min(100, average * 1.5))
          animationFrameRef.current = requestAnimationFrame(updateLevel)
        }
      }
      updateLevel()
      
      // Set up MediaRecorder
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = ''
        }
      }
      
      const options = mimeType ? { mimeType } : {}
      mediaRecorderRef.current = new MediaRecorder(stream, options)
      audioChunksRef.current = []
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorderRef.current.onstop = async () => {
        // Stop everything
        stream.getTracks().forEach(track => track.stop())
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        
        if (audioChunksRef.current.length === 0) {
          setUploadError('No audio recorded. Please try again.')
          return
        }
        
        const blob = new Blob(audioChunksRef.current, { 
          type: mediaRecorderRef.current.mimeType || 'audio/webm' 
        })
        
        if (blob.size < 1000) {
          setUploadError('Recording too short. Please speak for at least 1 second.')
          return
        }
        
        // Transcribe using backend
        await transcribeAudio(blob)
      }
      
      mediaRecorderRef.current.start(100)
      setIsListening(true)
      setRecordingDuration(0)
      setUploadError('')
      setInterimTranscript('Recording... Click mic to stop')
      
      // Duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
      
    } catch (err) {
      console.error('Microphone access error:', err)
      setUploadError('Microphone access denied. Please allow microphone access.')
      throw err // Re-throw so toggleVoiceInput can catch it
    }
  }, [])

  const stopRecording = useCallback(() => {
    setIsListening(false)
    setAudioLevel(0)
    setInterimTranscript('')
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }, [])

  // Transcribe audio using backend Whisper
  const transcribeAudio = async (blob) => {
    setIsTranscribing(true)
    setInterimTranscript('Transcribing...')
    
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      
      const response = await fetch('/api/voice-chat/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })
      
      if (!response.ok) {
        throw new Error('Transcription failed')
      }
      
      const data = await response.json()
      
      if (data.text && data.text.trim()) {
        setInputText(prev => (prev + ' ' + data.text).trim())
      } else {
        setUploadError('Could not transcribe audio. Please speak more clearly.')
      }
    } catch (err) {
      console.error('Transcription error:', err)
      setUploadError('Transcription failed. Please try again.')
    } finally {
      setIsTranscribing(false)
      setInterimTranscript('')
    }
  }

  // ============= UNIFIED TOGGLE =============
  const toggleVoiceInput = useCallback(async () => {
    try {
      if (isListening) {
        if (voiceMode === 'webapi') {
          stopListeningWebAPI()
        } else {
          stopRecording()
        }
      } else {
        if (voiceMode === 'webapi') {
          await startListeningWebAPI()
        } else {
          await startRecording()
        }
      }
    } catch (err) {
      console.error('Voice input error:', err)
      setUploadError('Voice input error: ' + (err.message || 'Unknown error'))
      setIsListening(false)
    }
  }, [isListening, voiceMode, startListeningWebAPI, stopListeningWebAPI, startRecording, stopRecording])

  // Stop listening helper (for use in handleSend)
  const stopListening = useCallback(() => {
    if (voiceMode === 'webapi') {
      stopListeningWebAPI()
    } else {
      stopRecording()
    }
  }, [voiceMode, stopListeningWebAPI, stopRecording])

  // Send message
  const handleSend = useCallback(async () => {
    // Combine typed text and any interim transcript
    const textToSend = (inputText + ' ' + interimTranscript).trim()
    if (!textToSend || isProcessing) return
    
    // Stop listening if active
    if (isListening) {
      stopListening()
    }
    
    // Clear input
    setInputText('')
    setInterimTranscript('')
    
    // Send message
    await sendMessage(textToSend)
    
  }, [inputText, interimTranscript, isProcessing, isListening, stopListening, sendMessage])

  // Handle enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Play message audio
  const playMessageAudio = async (text, messageId) => {
    if (isPlayingAudio && currentPlayingId === messageId) {
      audioRef.current?.pause()
      setIsPlayingAudio(false)
      setCurrentPlayingId(null)
      return
    }
    
    try {
      setCurrentPlayingId(messageId)
      setIsPlayingAudio(true)
      
      const response = await ttsService.generateSpeech(text, selectedVoice?.id)
      if (audioRef.current && response.data.audio_url) {
        // Reset audio element
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        
        // Set source and play
        audioRef.current.src = response.data.audio_url
        audioRef.current.load()
        
        // Handle play promise to catch autoplay errors
        const playPromise = audioRef.current.play()
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.error('Audio playback error:', err)
            setIsPlayingAudio(false)
            setCurrentPlayingId(null)
          })
        }
      } else {
        throw new Error('No audio URL in response')
      }
    } catch (err) {
      console.error('TTS error:', err)
      setIsPlayingAudio(false)
      setCurrentPlayingId(null)
    }
  }

  // Handle file upload
  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setUploadError('')
    
    if (!['application/pdf', 'text/plain'].includes(file.type)) {
      setUploadError('Please upload a PDF or TXT file')
      return
    }
    
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size must be less than 5MB')
      return
    }
    
    const result = await uploadDocument(file)
    if (!result.success) {
      setUploadError(result.error)
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Clear chat handler
  const handleClearChat = () => {
    clearChat()
    setInputText('')
    setInterimTranscript('')
    if (isListening) {
      stopListening()
    }
  }

  // Handle voice conversation messages - add to chat history
  const handleVoiceMessage = useCallback(({ userText, assistantText }) => {
    // Add messages from voice conversation directly to history (no API call)
    if (userText && assistantText) {
      addVoiceMessages(userText, assistantText)
    }
  }, [addVoiceMessages])

  // Combined display text
  const displayText = inputText + (interimTranscript ? (inputText ? ' ' : '') + interimTranscript : '')

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      {/* Hidden audio element for TTS playback */}
      <audio 
        ref={audioRef} 
        onEnded={() => { setIsPlayingAudio(false); setCurrentPlayingId(null) }}
        onError={(e) => { 
          console.error('Audio error:', e.target.error)
          setIsPlayingAudio(false)
          setCurrentPlayingId(null)
        }}
        className="hidden" 
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-xl flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">AI Assistant</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {uploadedDocument 
                ? `Analyzing: ${uploadedDocument.filename}` 
                : 'Chat or speak • Powered by Groq'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Voice Settings Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setShowVoiceSettings(!showVoiceSettings)} 
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Voice</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showVoiceSettings ? 'rotate-180' : ''}`} />
            </button>
            
            {showVoiceSettings && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 p-4 z-50">
                <h3 className="text-sm font-semibold mb-3 dark:text-gray-100">Voice Settings</h3>
                
                {/* Voice selection */}
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Response Voice</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  <button 
                    onClick={() => { setSelectedVoice(null); setShowVoiceSettings(false) }} 
                    className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors ${!selectedVoice ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'}`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Default Voice</span>
                  </button>
                  {clonedVoices.map(voice => (
                    <button 
                      key={voice.id} 
                      onClick={() => { setSelectedVoice(voice); setShowVoiceSettings(false) }} 
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors ${selectedVoice?.id === voice.id ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'}`}
                    >
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary-400 to-indigo-400 flex items-center justify-center">
                        <span className="text-white text-xs">{voice.name[0]}</span>
                      </div>
                      <span>{voice.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Voice Call button */}
          <button 
            onClick={() => setShowVoiceConversation(true)} 
            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-primary-500 to-indigo-600 text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-primary-500/30 transition-all" 
            title="Start voice conversation"
          >
            <Mic className="w-4 h-4" />
            <span className="hidden sm:inline">Voice</span>
          </button>
          
          {/* Clear chat button */}
          <button 
            onClick={handleClearChat} 
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-500 rounded-lg transition-colors" 
            title="Clear chat"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 ? (
            // Empty state
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary-100 to-indigo-100 dark:from-primary-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 dark:text-gray-100">How can I help you today?</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mb-6">
                Type a message or click the microphone to speak. I'll transcribe your voice in real-time.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button 
                  onClick={() => setInputText("Explain how voice cloning works")} 
                  className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300 rounded-full transition-colors"
                >
                  🎙️ Voice cloning?
                </button>
                <button 
                  onClick={() => setInputText("What can you help me with?")} 
                  className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300 rounded-full transition-colors"
                >
                  💡 What can you do?
                </button>
                <button 
                  onClick={() => setInputText("Tell me a fun fact")} 
                  className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300 rounded-full transition-colors"
                >
                  🎲 Fun fact
                </button>
              </div>
            </div>
          ) : (
            // Messages list
            <div className="space-y-4">
              {messages.map(message => (
                <div 
                  key={message.id} 
                  className={`flex ${
                    message.type === 'user' ? 'justify-end' : 
                    message.type === 'system' ? 'justify-center' : 'justify-start'
                  }`}
                >
                  {message.type === 'system' ? (
                    <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm">
                      {message.text}
                    </div>
                  ) : (
                    <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                      {/* Avatar */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        message.type === 'user' ? 'bg-primary-600' : 'bg-gray-700'
                      }`}>
                        {message.type === 'user' ? (
                          <User className="w-4 h-4 text-white" />
                        ) : (
                          <Bot className="w-4 h-4 text-white" />
                        )}
                      </div>
                      
                      {/* Message bubble */}
                      <div className="group relative">
                        <div className={`rounded-2xl px-4 py-3 ${
                          message.type === 'user' 
                            ? 'bg-primary-600 text-white rounded-br-md' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
                        }`}>
                          <div className="text-sm leading-relaxed">
                            {message.type === 'user' ? (
                              <p className="whitespace-pre-wrap">{message.text}</p>
                            ) : (
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                {message.text}
                              </ReactMarkdown>
                            )}
                            {message.isStreaming && (
                              <span className="inline-block w-2 h-4 bg-gray-600 dark:bg-gray-400 ml-1 animate-pulse rounded-sm" />
                            )}
                          </div>
                        </div>
                        
                        {/* Play audio button for assistant messages */}
                        {message.type === 'assistant' && !message.isStreaming && message.text && (
                          <button 
                            onClick={() => playMessageAudio(message.text, message.id)} 
                            className={`absolute -right-10 top-1/2 -translate-y-1/2 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all ${
                              currentPlayingId === message.id && isPlayingAudio 
                                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600' 
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`} 
                            title="Play audio"
                          >
                            {currentPlayingId === message.id && isPlayingAudio ? (
                              <Square className="w-4 h-4" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        
                        {/* Timestamp */}
                        {!message.isStreaming && (
                          <p className={`text-xs mt-1 text-gray-400 dark:text-gray-500 ${message.type === 'user' ? 'text-right' : ''}`}>
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t dark:border-gray-700 p-4">
          {/* Document indicator */}
          {uploadedDocument && (
            <div className="mb-3 flex items-center gap-2 p-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/30 rounded-lg">
              <FileText className="w-4 h-4 text-primary-600 flex-shrink-0" />
              <span className="text-sm text-primary-900 dark:text-primary-200 truncate flex-1">{uploadedDocument.filename}</span>
              <span className="text-xs text-primary-600 dark:text-primary-400">{(uploadedDocument.characterCount / 1000).toFixed(1)}k</span>
              <button onClick={removeDocument} className="p-1 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded">
                <X className="w-4 h-4 text-primary-600" />
              </button>
            </div>
          )}
          
          {/* Error display */}
          {uploadError && (
            <div className="mb-3 flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-lg text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{uploadError}</span>
              <button onClick={() => setUploadError('')} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          {/* Voice recording indicator */}
          {(isListening || isTranscribing) && (
            <div className="mb-3 flex items-center justify-between p-3 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border border-red-200 dark:border-red-800/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${isTranscribing ? 'bg-blue-500' : 'bg-red-500'}`} />
                  <div className={`absolute inset-0 w-3 h-3 rounded-full animate-ping ${isTranscribing ? 'bg-blue-500' : 'bg-red-500'}`} />
                </div>
                <span className={`text-sm font-medium ${isTranscribing ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}`}>
                  {isTranscribing ? 'Transcribing...' : 'Recording...'}
                </span>
                {!isTranscribing && <AudioLevelIndicator level={audioLevel} />}
              </div>
              <p className={`text-xs ${isTranscribing ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                {isTranscribing ? 'Converting your speech to text' : (voiceMode === 'webapi' ? 'Your speech appears in the input box' : 'Click mic again to stop and transcribe')}
              </p>
            </div>
          )}
          
          {/* Input row */}
          <div className="flex items-center gap-2">
            {/* File upload button */}
            <label 
              className={`p-2.5 rounded-xl cursor-pointer transition-colors ${
                uploadedDocument 
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`} 
              title="Upload document (PDF, TXT)"
            >
              {isUploadingDocument ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <FileUp className="w-5 h-5" />
              )}
              <input 
                ref={fileInputRef} 
                type="file" 
                accept=".pdf,.txt" 
                onChange={handleFileSelect} 
                disabled={isUploadingDocument} 
                className="hidden" 
              />
            </label>
            
            {/* Text input */}
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={displayText}
                onChange={(e) => {
                  setInputText(e.target.value)
                  setInterimTranscript('')
                }}
                onKeyPress={handleKeyPress}
                placeholder={
                  isListening 
                    ? "Listening... speak now" 
                    : uploadedDocument 
                      ? "Ask about the document..." 
                      : "Type a message or click 🎤 to speak..."
                }
                className={`w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 border-0 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white dark:focus:bg-gray-600 transition-all ${
                  isListening ? 'bg-red-50 dark:bg-red-900/20 ring-2 ring-red-300' : ''
                } ${interimTranscript ? 'italic text-gray-500 dark:text-gray-400' : ''}`}
                disabled={isProcessing}
              />
            </div>
            
            {/* Voice input button */}
            <button 
              onClick={toggleVoiceInput}
              disabled={isProcessing}
              className={`p-2.5 rounded-xl transition-all ${
                isListening 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600'
              }`}
              title={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            
            {/* Send button */}
            <button 
              onClick={handleSend} 
              disabled={!displayText.trim() || isProcessing}
              className="p-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Send message"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          
          {/* Help text */}
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2">
            Press Enter to send • Click Voice button for hands-free conversation
          </p>
        </div>
      </div>
      
      {/* Voice Conversation Modal */}
      <VoiceConversation 
        isOpen={showVoiceConversation}
        onClose={() => setShowVoiceConversation(false)}
        onMessage={handleVoiceMessage}
      />
    </div>
  )
}
