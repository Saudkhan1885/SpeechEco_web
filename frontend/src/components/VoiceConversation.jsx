import { useState, useRef, useEffect } from 'react'
import { 
  Mic, Volume2, X, Loader2, Sparkles, PhoneOff
} from 'lucide-react'
import { useVoice } from '../contexts/VoiceContext'

// Voice conversation states
const STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking'
}

// Pulsing circle for listening state
const ListeningIndicator = ({ audioLevel }) => {
  const scale = 1 + (audioLevel / 100) * 0.3
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse rings */}
      <div 
        className="absolute w-48 h-48 rounded-full bg-primary-500/10 animate-ping"
        style={{ animationDuration: '2s' }}
      />
      <div 
        className="absolute w-40 h-40 rounded-full bg-primary-500/20 animate-ping"
        style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}
      />
      <div 
        className="absolute w-32 h-32 rounded-full bg-primary-500/30 animate-ping"
        style={{ animationDuration: '1s', animationDelay: '0.6s' }}
      />
      
      {/* Main circle */}
      <div 
        className="w-28 h-28 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-2xl shadow-primary-500/50 transition-transform duration-150"
        style={{ transform: `scale(${scale})` }}
      >
        <Mic className="w-12 h-12 text-white" />
      </div>
    </div>
  )
}

// Speaking animation
const SpeakingIndicator = () => {
  return (
    <div className="relative flex items-center justify-center">
      {/* Animated sound waves */}
      <div className="absolute w-48 h-48 rounded-full border-4 border-indigo-300/30 animate-ping" style={{ animationDuration: '1.5s' }} />
      <div className="absolute w-40 h-40 rounded-full border-4 border-indigo-400/40 animate-ping" style={{ animationDuration: '1.2s', animationDelay: '0.2s' }} />
      <div className="absolute w-32 h-32 rounded-full border-4 border-indigo-500/50 animate-ping" style={{ animationDuration: '0.9s', animationDelay: '0.4s' }} />
      
      {/* Speaker icon */}
      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-purple-500/50">
        <Volume2 className="w-12 h-12 text-white animate-pulse" />
      </div>
    </div>
  )
}

// Processing spinner
const ProcessingIndicator = () => {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute w-36 h-36 rounded-full border-4 border-amber-400/20 animate-spin" style={{ animationDuration: '3s' }} />
      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-2xl shadow-orange-500/50">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    </div>
  )
}

// Idle state - waiting
const IdleIndicator = () => {
  return (
    <div className="relative flex items-center justify-center">
      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-xl">
        <Mic className="w-12 h-12 text-white/70" />
      </div>
    </div>
  )
}

export default function VoiceConversation({ isOpen, onClose, onMessage }) {
  const { selectedVoice } = useVoice()
  
  // Keep a ref to always have the latest selectedVoice in callbacks/closures
  const selectedVoiceRef = useRef(selectedVoice)
  useEffect(() => {
    selectedVoiceRef.current = selectedVoice
  }, [selectedVoice])
  
  // Conversation state
  const [state, setState] = useState(STATES.IDLE)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState('')
  
  // Transcript display
  const [userTranscript, setUserTranscript] = useState('')
  const [assistantText, setAssistantText] = useState('')
  
  // Refs
  const isListeningRef = useRef(false)
  const isActiveRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const audioRef = useRef(null)
  const sessionIdRef = useRef(null)
  
  // Audio queue for streaming playback
  const audioQueueRef = useRef([])
  const isPlayingQueueRef = useRef(false)
  const allChunksReceivedRef = useRef(false)
  
  // Silence detection refs
  const silenceStartRef = useRef(null)
  const hasSpokenRef = useRef(false)
  const silenceThreshold = 15 // Audio level below this is considered silence
  const silenceDuration = 1500 // ms of silence before auto-stop (1.5 seconds)
  const minSpeechDuration = 500 // ms of speech required before silence detection kicks in
  const speechStartRef = useRef(null)
  
  // Start conversation when modal opens
  useEffect(() => {
    if (isOpen) {
      isActiveRef.current = true
      // Reset session so new voice is used
      sessionIdRef.current = null
      startListening()
    } else {
      cleanup()
      setState(STATES.IDLE)
      setUserTranscript('')
      setAssistantText('')
      isActiveRef.current = false
      sessionIdRef.current = null
    }
    
    return () => {
      cleanup()
      isActiveRef.current = false
    }
  }, [isOpen])
  
  // Reset session when voice changes so next request uses the new voice
  useEffect(() => {
    sessionIdRef.current = null
  }, [selectedVoice])
  
  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        endConversation()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])
  
  const cleanup = () => {
    isListeningRef.current = false
    hasSpokenRef.current = false
    silenceStartRef.current = null
    speechStartRef.current = null
    
    // Clear audio queue
    audioQueueRef.current = []
    isPlayingQueueRef.current = false
    allChunksReceivedRef.current = false
    
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch (e) {
        // Ignore
      }
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
  }
  
  // Start listening for voice input with auto-silence detection
  const startListening = async () => {
    if (!isActiveRef.current) return
    
    setError('')
    hasSpokenRef.current = false
    silenceStartRef.current = null
    speechStartRef.current = null
    
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
      
      // Set up audio analysis
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 256
      
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
        // Stop the stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        
        if (audioChunksRef.current.length === 0 || !hasSpokenRef.current) {
          // No speech detected, restart listening
          if (isActiveRef.current) {
            setTimeout(() => startListening(), 300)
          }
          return
        }
        
        const blob = new Blob(audioChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'audio/webm'
        })
        
        if (blob.size < 1000) {
          // Recording too short, restart listening
          if (isActiveRef.current) {
            setTimeout(() => startListening(), 300)
          }
          return
        }
        
        // Process the voice input
        await processVoiceInput(blob)
      }
      
      mediaRecorderRef.current.start()
      setState(STATES.LISTENING)
      isListeningRef.current = true
      setUserTranscript('')
      
      // Monitor audio levels with silence detection
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      const updateLevel = () => {
        if (!analyserRef.current || !isListeningRef.current) return
        
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const level = Math.min(100, average * 1.5)
        setAudioLevel(level)
        
        const now = Date.now()
        
        // Check if user is speaking
        if (level > silenceThreshold) {
          // User is speaking
          if (!hasSpokenRef.current) {
            hasSpokenRef.current = true
            speechStartRef.current = now
          }
          silenceStartRef.current = null // Reset silence timer
        } else {
          // Silence detected
          if (hasSpokenRef.current && speechStartRef.current) {
            // Only start silence timer if user has spoken for minimum duration
            const speechDuration = now - speechStartRef.current
            if (speechDuration >= minSpeechDuration) {
              if (!silenceStartRef.current) {
                silenceStartRef.current = now
              } else {
                // Check if silence has lasted long enough
                const silenceTime = now - silenceStartRef.current
                if (silenceTime >= silenceDuration) {
                  // Auto-stop and process
                  stopListening()
                  return
                }
              }
            }
          }
        }
        
        animationFrameRef.current = requestAnimationFrame(updateLevel)
      }
      
      updateLevel()
      
    } catch (err) {
      console.error('Microphone error:', err)
      setError('Microphone access denied. Please allow microphone access.')
      setState(STATES.IDLE)
      isListeningRef.current = false
    }
  }
  
  // Stop listening and process
  const stopListening = () => {
    if (!isListeningRef.current) return
    
    setAudioLevel(0)
    isListeningRef.current = false
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setState(STATES.PROCESSING)
      mediaRecorderRef.current.stop()
    }
  }
  
  // Play queued audio chunks sequentially
  const playNextInQueue = () => {
    if (!isActiveRef.current) {
      isPlayingQueueRef.current = false
      return
    }
    
    if (audioQueueRef.current.length === 0) {
      // No more chunks in queue
      if (allChunksReceivedRef.current) {
        // All chunks played, we're done speaking
        isPlayingQueueRef.current = false
        setState(STATES.IDLE)
        if (isActiveRef.current) {
          setTimeout(() => startListening(), 300)
        }
      } else {
        // More chunks may arrive, wait and retry
        isPlayingQueueRef.current = false
      }
      return
    }
    
    isPlayingQueueRef.current = true
    setState(STATES.SPEAKING)
    
    const base64Audio = audioQueueRef.current.shift()
    
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    
    const audio = audioRef.current
    
    audio.onended = () => {
      playNextInQueue()
    }
    
    audio.onerror = (err) => {
      console.error('Audio chunk playback error:', err)
      playNextInQueue()
    }
    
    // Play from base64 data URI
    audio.src = `data:audio/wav;base64,${base64Audio}`
    audio.load()
    audio.play().catch(err => {
      console.error('Play error:', err)
      playNextInQueue()
    })
  }
  
  // Enqueue an audio chunk and start playback if not already playing
  const enqueueAudio = (base64Audio) => {
    audioQueueRef.current.push(base64Audio)
    if (!isPlayingQueueRef.current) {
      playNextInQueue()
    }
  }
  
  // Process voice input through streaming backend endpoint
  const processVoiceInput = async (audioBlob) => {
    setState(STATES.PROCESSING)
    setError('')
    
    // Reset audio queue for new response
    audioQueueRef.current = []
    isPlayingQueueRef.current = false
    allChunksReceivedRef.current = false
    
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      
      // Build URL with query params - use ref to get latest voice selection
      let url = '/api/voice-chat/message/stream'
      const params = new URLSearchParams()
      const currentVoice = selectedVoiceRef.current
      if (sessionIdRef.current) params.append('session_id', sessionIdRef.current)
      if (currentVoice?.id) params.append('voice_id', currentVoice.id)
      if (params.toString()) url += '?' + params.toString()
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Voice processing failed')
      }
      
      // Read SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamAssistantText = ''
      let streamUserText = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        
        // Parse SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          
          try {
            const event = JSON.parse(jsonStr)
            
            switch (event.type) {
              case 'stt_complete':
                streamUserText = event.text || ''
                setUserTranscript(streamUserText)
                break
              
              case 'llm_start':
                setState(STATES.PROCESSING)
                setAssistantText('')
                break
              
              case 'llm_chunk':
                // Accumulate and display streaming text
                streamAssistantText += (event.content || '')
                setAssistantText(streamAssistantText)
                break
              
              case 'tts_chunk':
                // Audio chunk arrived - enqueue for playback
                if (event.audio_data) {
                  enqueueAudio(event.audio_data)
                }
                break
              
              case 'llm_complete':
                streamAssistantText = event.text || streamAssistantText
                setAssistantText(streamAssistantText)
                break
              
              case 'complete':
                // All chunks have been sent
                allChunksReceivedRef.current = true
                
                if (event.session_id) {
                  sessionIdRef.current = event.session_id
                }
                
                // Notify parent component
                if (onMessage) {
                  onMessage({
                    userText: event.user_text || streamUserText,
                    assistantText: event.assistant_text || streamAssistantText
                  })
                }
                
                // If nothing is playing and queue is empty, restart listening
                if (!isPlayingQueueRef.current && audioQueueRef.current.length === 0) {
                  setState(STATES.IDLE)
                  if (isActiveRef.current) {
                    setTimeout(() => startListening(), 300)
                  }
                }
                break
              
              case 'error':
                console.error('Stream error:', event)
                setError(event.message || 'Processing failed')
                setState(STATES.IDLE)
                if (isActiveRef.current) {
                  setTimeout(() => startListening(), 2000)
                }
                break
            }
          } catch (parseErr) {
            // Skip invalid JSON lines
          }
        }
      }
      
    } catch (err) {
      console.error('Voice processing error:', err)
      setError(err.message || 'Failed to process voice')
      setState(STATES.IDLE)
      
      // Retry listening after error
      if (isActiveRef.current) {
        setTimeout(() => startListening(), 2000)
      }
    }
  }
  
  // Play audio response from AI (kept as fallback)
  const playAudioResponse = async (audioUrl) => {
    setState(STATES.SPEAKING)
    
    return new Promise((resolve) => {
      if (!audioRef.current) {
        audioRef.current = new Audio()
      }
      
      const audio = audioRef.current
      
      audio.onended = () => {
        setState(STATES.IDLE)
        if (isActiveRef.current) {
          setTimeout(() => startListening(), 300)
        }
        resolve()
      }
      
      audio.onerror = (err) => {
        console.error('Audio playback error:', err)
        setError('Failed to play response')
        setState(STATES.IDLE)
        if (isActiveRef.current) {
          setTimeout(() => startListening(), 1000)
        }
        resolve()
      }
      
      audio.src = audioUrl
      audio.load()
      audio.play().catch(err => {
        console.error('Play error:', err)
        setState(STATES.IDLE)
        if (isActiveRef.current) {
          setTimeout(() => startListening(), 1000)
        }
        resolve()
      })
    })
  }
  
  // End conversation
  const endConversation = () => {
    cleanup()
    onClose()
  }
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      {/* Close/End button */}
      <button
        onClick={endConversation}
        className="absolute top-6 right-6 p-3 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded-full transition-all"
        title="End conversation"
      >
        <PhoneOff className="w-6 h-6" />
      </button>
      
      {/* Header */}
      <div className="absolute top-6 left-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-white font-semibold">AI Assistant</h2>
          <p className="text-gray-400 text-xs">
            {selectedVoice ? selectedVoice.name : 'Default voice'}
          </p>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex flex-col items-center justify-center px-8 max-w-lg">
        {/* Status indicator */}
        <div className="mb-8">
          {state === STATES.LISTENING && (
            <ListeningIndicator audioLevel={audioLevel} />
          )}
          {state === STATES.PROCESSING && (
            <ProcessingIndicator />
          )}
          {state === STATES.SPEAKING && (
            <SpeakingIndicator />
          )}
          {state === STATES.IDLE && (
            <IdleIndicator />
          )}
        </div>
        
        {/* Status text */}
        <div className="text-center mb-8">
          {state === STATES.LISTENING && (
            <div>
              <p className="text-primary-400 font-medium text-xl animate-pulse">Listening...</p>
              <p className="text-gray-500 text-sm mt-2">Speak naturally, I'll respond when you pause</p>
            </div>
          )}
          {state === STATES.PROCESSING && (
            <div>
              <p className="text-amber-400 font-medium text-xl">Processing...</p>
              <p className="text-gray-500 text-sm mt-2">Understanding your request</p>
            </div>
          )}
          {state === STATES.SPEAKING && (
            <div>
              <p className="text-purple-400 font-medium text-xl">Speaking...</p>
              <p className="text-gray-500 text-sm mt-2">Tap anywhere to interrupt</p>
            </div>
          )}
          {state === STATES.IDLE && (
            <div>
              <p className="text-gray-400 font-medium text-xl">Starting...</p>
              <p className="text-gray-500 text-sm mt-2">Preparing microphone</p>
            </div>
          )}
        </div>
        
        {/* Transcript display */}
        {(userTranscript || assistantText) && (
          <div className="w-full max-w-md space-y-3 mb-8">
            {userTranscript && (
              <div className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">You said:</p>
                <p className="text-white">{userTranscript}</p>
              </div>
            )}
            {assistantText && (
              <div className="bg-primary-500/10 backdrop-blur rounded-2xl p-4 border border-primary-500/20">
                <p className="text-xs text-primary-400 mb-1">Assistant:</p>
                <p className="text-white">{assistantText}</p>
              </div>
            )}
          </div>
        )}
        
        {/* Error display */}
        {error && (
          <div className="w-full max-w-md bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-8">
            <p className="text-red-400 text-center">{error}</p>
          </div>
        )}
        
        {/* Tap to interrupt when speaking */}
        {state === STATES.SPEAKING && (
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current.currentTime = 0
              }
              // Clear audio queue on interrupt
              audioQueueRef.current = []
              isPlayingQueueRef.current = false
              allChunksReceivedRef.current = true
              setState(STATES.IDLE)
              if (isActiveRef.current) {
                setTimeout(() => startListening(), 300)
              }
            }}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
          >
            Tap to interrupt
          </button>
        )}
      </div>
      
      {/* Bottom hint */}
      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-gray-600 text-sm">
          Press <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-400">ESC</kbd> or tap <X className="w-4 h-4 inline" /> to end
        </p>
      </div>
    </div>
  )
}
