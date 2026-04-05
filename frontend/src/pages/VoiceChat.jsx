import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX,
  Play,
  Pause,
  Square,
  Loader2,
  MessageCircle,
  Sparkles,
  Settings,
  ChevronDown,
  ChevronUp,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle,
  Waves
} from 'lucide-react'
import { useVoice } from '../contexts/VoiceContext'
import { voiceChatService, ttsService } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const AudioVisualizer = ({ isActive, audioData }) => {
  const canvasRef = useRef(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, width, height)
    
    if (isActive && audioData) {
      const bars = 50
      const barWidth = width / bars - 2
      ctx.fillStyle = '#8b5cf6'
      
      for (let i = 0; i < bars; i++) {
        const value = audioData[i] || Math.random() * 0.3
        const barHeight = value * height * 0.8
        const x = i * (barWidth + 2)
        const y = (height - barHeight) / 2
        ctx.fillRect(x, y, barWidth, barHeight)
      }
    } else {
      const bars = 50
      const barWidth = width / bars - 2
      ctx.fillStyle = '#374151'
      
      for (let i = 0; i < bars; i++) {
        const barHeight = 4
        const x = i * (barWidth + 2)
        const y = (height - barHeight) / 2
        ctx.fillRect(x, y, barWidth, barHeight)
      }
    }
  }, [isActive, audioData])
  
  return <canvas ref={canvasRef} width={400} height={80} className="w-full h-20 rounded-lg" />
}

export default function VoiceChat() {
  const { clonedVoices, selectedVoice, setSelectedVoice } = useVoice()
  const { token } = useAuth()
  
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [conversation, setConversation] = useState([])
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [audioData, setAudioData] = useState(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const audioRef = useRef(null)
  const recordingTimerRef = useRef(null)
  
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const [vcStatus, ttsStatus] = await Promise.all([
          voiceChatService.getStatus(),
          ttsService.getStatus()
        ])
        setStatus({
          stt: vcStatus.data.stt_available,
          tts: ttsStatus.data.available,
          device: ttsStatus.data.device
        })
      } catch (err) {
        setStatus({ stt: false, tts: false, device: 'unavailable' })
      }
    }
    checkStatus()
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 128
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      const updateVisualizer = () => {
        if (analyserRef.current && isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray)
          setAudioData(Array.from(dataArray).map(v => v / 255))
          requestAnimationFrame(updateVisualizer)
        }
      }
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      
      mediaRecorderRef.current.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await processVoiceMessage(audioBlob)
      }
      
      mediaRecorderRef.current.start(100)
      setIsRecording(true)
      setRecordingDuration(0)
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
      
      requestAnimationFrame(updateVisualizer)
    } catch (err) {
      setError('Microphone access denied. Please allow microphone access.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setAudioData(null)
    }
  }, [])

  const processVoiceMessage = async (audioBlob) => {
    if (!token) {
      setError('Please log in to use voice chat')
      return
    }
    
    setIsProcessing(true)
    const userMessage = {
      id: Date.now(),
      type: 'user',
      audioUrl: URL.createObjectURL(audioBlob),
      timestamp: new Date().toISOString()
    }
    setConversation(prev => [...prev, userMessage])
    
    try {
      const response = await voiceChatService.sendVoiceMessage(audioBlob, sessionId, selectedVoice?.id)
      const data = response.data
      
      if (data.session_id) setSessionId(data.session_id)
      
      const assistantMessage = {
        id: Date.now() + 1,
        type: 'assistant',
        text: data.ai_response,
        transcription: data.transcription,
        audioUrl: data.audio_url,
        timestamp: new Date().toISOString()
      }
      setConversation(prev => [...prev, assistantMessage])
      
      if (data.audio_url && audioRef.current) {
        audioRef.current.src = data.audio_url
        audioRef.current.play()
        setIsPlaying(true)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to process voice message')
    }
    setIsProcessing(false)
  }

  const playAudio = (url) => {
    if (audioRef.current) {
      audioRef.current.src = url
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }

  const clearConversation = () => {
    setConversation([])
    setSessionId(null)
    if (sessionId) {
      voiceChatService.clearSession(sessionId).catch(() => {})
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isReady = status?.stt && status?.tts

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <MessageCircle className="w-8 h-8 text-primary-600" />
            Voice Chat
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-violet-500 to-purple-500 text-white">
              <Waves className="w-3 h-3 mr-1" />Real-time
            </span>
          </h1>
          <p className="text-gray-500 mt-1">Have natural voice conversations with AI</p>
        </div>
        <div className={'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ' + (isReady ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
          {isReady ? (<><CheckCircle className="w-4 h-4" /><span>Ready ({status?.device})</span></>) : (<><AlertCircle className="w-4 h-4" /><span>Service Unavailable</span></>)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Conversation</h2>
              {conversation.length > 0 && (
                <button onClick={clearConversation} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1">
                  <Trash2 className="w-4 h-4" />Clear
                </button>
              )}
            </div>
            
            <div className="min-h-[300px] max-h-[500px] overflow-y-auto space-y-4 mb-6">
              {conversation.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <Mic className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Start a conversation</p>
                  <p className="text-sm mt-1">Press and hold the microphone button to speak</p>
                </div>
              )}
              
              {conversation.map((msg) => (
                <div key={msg.id} className={'flex ' + (msg.type === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={'max-w-[80%] rounded-2xl p-4 ' + (msg.type === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-900')}>
                    {msg.type === 'assistant' && msg.transcription && (
                      <p className="text-xs text-gray-500 mb-2 italic">You said: "{msg.transcription}"</p>
                    )}
                    {msg.text && <p className="text-sm">{msg.text}</p>}
                    {msg.audioUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => playAudio(msg.audioUrl)} className={'p-1.5 rounded-full ' + (msg.type === 'user' ? 'bg-primary-500 hover:bg-primary-400' : 'bg-gray-200 hover:bg-gray-300')}>
                          <Play className="w-3 h-3" />
                        </button>
                        <span className="text-xs opacity-75">Audio message</span>
                      </div>
                    )}
                    <p className={'text-xs mt-2 ' + (msg.type === 'user' ? 'text-primary-200' : 'text-gray-400')}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                      <span className="text-sm text-gray-600">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-6">
              <AudioVisualizer isActive={isRecording} audioData={audioData} />
              
              <div className="flex items-center justify-center gap-4 mt-4">
                {isRecording && (
                  <div className="text-sm font-medium text-red-500 animate-pulse">
                    Recording: {formatDuration(recordingDuration)}
                  </div>
                )}
                
                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={isRecording ? stopRecording : undefined}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  disabled={!isReady || isProcessing}
                  className={'relative p-6 rounded-full transition-all transform ' + 
                    (isRecording 
                      ? 'bg-red-500 scale-110 shadow-lg shadow-red-500/50' 
                      : 'bg-gradient-to-br from-primary-600 to-indigo-600 hover:scale-105 shadow-lg shadow-primary-500/30'
                    ) + 
                    ' disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100'
                  }
                >
                  {isRecording ? <MicOff className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
                  {isRecording && (
                    <span className="absolute inset-0 rounded-full animate-ping bg-red-500 opacity-25" />
                  )}
                </button>
              </div>
              
              <p className="text-center text-sm text-gray-500 mt-3">
                {isRecording ? 'Release to send' : 'Hold to speak'}
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <button onClick={() => setShowSettings(!showSettings)} className="w-full flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="w-5 h-5" />Settings
              </h2>
              {showSettings ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            
            {showSettings && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Response Voice</label>
                  <button onClick={() => setSelectedVoice(null)} className={'w-full flex items-center gap-3 p-3 rounded-lg border transition-all mb-2 ' + (!selectedVoice ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300')}>
                    <div className={'w-8 h-8 rounded-full flex items-center justify-center ' + (!selectedVoice ? 'bg-primary-600' : 'bg-gray-200')}>
                      <Sparkles className={'w-4 h-4 ' + (!selectedVoice ? 'text-white' : 'text-gray-500')} />
                    </div>
                    <span className="text-sm font-medium">Default Voice</span>
                  </button>
                  
                  {clonedVoices.length > 0 && (
                    <div className="space-y-2">
                      {clonedVoices.map((voice) => (
                        <button key={voice.id} onClick={() => setSelectedVoice(voice)} className={'w-full flex items-center gap-3 p-3 rounded-lg border transition-all ' + (selectedVoice?.id === voice.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300')}>
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-indigo-400 flex items-center justify-center">
                            <span className="text-white text-xs font-medium">{voice.name[0].toUpperCase()}</span>
                          </div>
                          <span className="text-sm font-medium">{voice.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="card bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <h3 className="font-semibold text-gray-900 mb-3">How it works</h3>
            <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
              <li>Hold the microphone button</li>
              <li>Speak your message</li>
              <li>Release to send</li>
              <li>Listen to AI response</li>
            </ol>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Tips</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Speak clearly for best results</li>
              <li>• Minimize background noise</li>
              <li>• Use cloned voices for personalized responses</li>
              <li>• Tap message audio to replay</li>
            </ul>
          </div>
        </div>
      </div>

      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} className="hidden" />
    </div>
  )
}
