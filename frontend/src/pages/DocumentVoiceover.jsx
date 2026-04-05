import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Upload, 
  FileText, 
  Loader2, 
  Download,
  Play,
  Pause,
  X,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Settings,
  ChevronDown,
  ChevronUp,
  Zap,
  BookOpen,
  Users,
  MapPin,
  Volume2,
  Square,
  SkipBack,
  SkipForward
} from 'lucide-react'
import { useVoice } from '../contexts/VoiceContext'
import { documentService, ttsService } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const SUPPORTED_FORMATS = {
  'application/pdf': { ext: '.pdf', icon: '📄', name: 'PDF Document', color: 'red' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', icon: '📝', name: 'Word Document', color: 'blue' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: '.pptx', icon: '📊', name: 'PowerPoint', color: 'orange' },
  'application/vnd.ms-powerpoint': { ext: '.ppt', icon: '📊', name: 'PowerPoint (Legacy)', color: 'orange' },
  'text/plain': { ext: '.txt', icon: '📃', name: 'Text File', color: 'gray' },
}

const MAX_FILE_SIZE = 100 * 1024 * 1024

export default function DocumentVoiceover() {
  const { clonedVoices, selectedVoice, setSelectedVoice } = useVoice()
  const { token } = useAuth()
  const fileInputRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const currentSourceRef = useRef(null)
  const stoppedRef = useRef(false) // New ref to track explicit stop
  const playbackIdRef = useRef(0) // Track current playback session
  const abortControllerRef = useRef(null) // For aborting TTS stream requests

  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [rawText, setRawText] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)
  const [ttsStatus, setTtsStatus] = useState(null)
  const [documentStats, setDocumentStats] = useState(null)
  const [entities, setEntities] = useState(null)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [applyNlp, setApplyNlp] = useState(true)
  const [optimizeTts, setOptimizeTts] = useState(true)
  const [showRawText, setShowRawText] = useState(false)
  
  // Streaming state
  const [useStreaming, setUseStreaming] = useState(true)
  const [streamingProgress, setStreamingProgress] = useState({ current: 0, total: 0, text: '' })
  const [isStreamingComplete, setIsStreamingComplete] = useState(false)
  const [allAudioChunks, setAllAudioChunks] = useState([]) // Array of {audioData, text, index}
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [textChunks, setTextChunks] = useState([]) // Array of {text, index} for clickable text
  const [uiResetKey, setUiResetKey] = useState(0)
  const playbackQueueRef = useRef([])
  
  // Voice control settings
  const [voiceSettings, setVoiceSettings] = useState({
    exaggeration: 0.5,  // Emotion intensity (0-1), lower = calmer
    cfgWeight: 0.3,     // Pacing/speed control (0-1), lower = slower/more natural
    temperature: 0.8    // Variation (0.1-2), higher = more varied
  })
  const [showVoiceControls, setShowVoiceControls] = useState(false)

  // Helper function to abort any ongoing TTS stream
  const abortTTSStream = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('[DocumentVoiceover] Aborting TTS stream')
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      abortTTSStream()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioContextRef.current
  }, [])

  const playNextChunk = useCallback(async (sessionId) => {
    // Check if we should stop - use both refs for safety
    if (stoppedRef.current || !isPlayingRef.current || sessionId !== playbackIdRef.current) {
      setIsPlaying(false)
      isPlayingRef.current = false
      return
    }
    
    // Check if there are chunks in the live queue (during streaming)
    if (audioQueueRef.current.length > 0) {
      const ctx = getAudioContext()
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      // Double-check session before proceeding
      if (sessionId !== playbackIdRef.current) {
        return
      }

      const chunk = audioQueueRef.current.shift()
      setCurrentChunkIndex(chunk.index)
      
      try {
        const audioBuffer = await ctx.decodeAudioData(chunk.audioData.buffer.slice(0))
        
        // Triple-check session after async operation
        if (sessionId !== playbackIdRef.current || stoppedRef.current) {
          return
        }
        
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        currentSourceRef.current = source
        
        // Capture session ID for closure
        const currentSession = sessionId
        
        source.onended = () => {
          // Only clear ref if this is still the current source
          if (currentSourceRef.current === source) {
            currentSourceRef.current = null
          }
          // Only continue if not stopped and same session
          if (!stoppedRef.current && isPlayingRef.current && currentSession === playbackIdRef.current) {
            playNextChunk(currentSession)
          }
        }
        
        source.start(0)
      } catch (err) {
        console.error('Error playing audio chunk:', err)
        if (!stoppedRef.current && isPlayingRef.current && sessionId === playbackIdRef.current) {
          playNextChunk(sessionId)
        }
      }
    } else if (isStreamingComplete && audioQueueRef.current.length === 0) {
      // No more chunks in queue and streaming is done
      setIsPlaying(false)
      isPlayingRef.current = false
    }
  }, [getAudioContext, isStreamingComplete])

  const handleAudioChunk = useCallback((chunkData) => {
    console.log('Received chunk ' + (chunkData.index + 1) + ': "' + chunkData.text.substring(0, 30) + '..."')
    
    setStreamingProgress({
      current: chunkData.index + 1,
      total: chunkData.index + 1,
      text: chunkData.text.substring(0, 50) + '...'
    })
    
    // Store chunk with text for clickable playback
    const chunkObj = {
      audioData: chunkData.audioData,
      text: chunkData.text,
      index: chunkData.index
    }
    
    setAllAudioChunks(prev => [...prev, chunkObj])
    setTextChunks(prev => [...prev, { text: chunkData.text, index: chunkData.index }])
    audioQueueRef.current.push(chunkObj)
    
    // Start playback if not paused and not stopped
    if (!isPlayingRef.current && !isPaused && !stoppedRef.current) {
      stoppedRef.current = false
      isPlayingRef.current = true
      setIsPlaying(true)
      const sessionId = playbackIdRef.current
      playNextChunk(sessionId)
    }
  }, [playNextChunk, isPaused])

  const handleStreamingComplete = useCallback((data) => {
    console.log('Streaming complete: ' + data.totalChunks + ' chunks')
    setStreamingProgress(prev => ({ ...prev, total: data.totalChunks }))
    setIsStreamingComplete(true)
    setIsConverting(false)
  }, [])

  const handleStreamingError = useCallback((err) => {
    console.error('Streaming error:', err)
    setError(err.message || 'Failed to stream audio')
    setIsConverting(false)
    setIsPlaying(false)
    isPlayingRef.current = false
  }, [])

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await ttsService.getStatus()
        setTtsStatus(response.data)
      } catch (err) {
        setTtsStatus({ available: false, device: 'unavailable' })
      }
    }
    checkStatus()
  }, [])

  const getAcceptedTypes = () => Object.keys(SUPPORTED_FORMATS).join(',') + ',.pdf,.docx,.pptx,.ppt,.txt'

  const isFileSupported = (fileType, fileName) => {
    if (SUPPORTED_FORMATS[fileType]) return true
    const ext = fileName.toLowerCase().split('.').pop()
    return ['pdf', 'docx', 'pptx', 'ppt', 'txt'].includes(ext)
  }

  const getFileInfo = (f) => {
    const format = SUPPORTED_FORMATS[f.type]
    if (format) return format
    const ext = f.name.toLowerCase().split('.').pop()
    const extMap = {
      'pdf': SUPPORTED_FORMATS['application/pdf'],
      'docx': SUPPORTED_FORMATS['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'pptx': SUPPORTED_FORMATS['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      'ppt': SUPPORTED_FORMATS['application/vnd.ms-powerpoint'],
      'txt': SUPPORTED_FORMATS['text/plain'],
    }
    return extMap[ext] || { ext: '.'+ext, icon: '📄', name: 'Document', color: 'gray' }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && isFileSupported(droppedFile.type, droppedFile.name)) {
      handleFileUpload(droppedFile)
    } else {
      setError('Unsupported file type. Please upload PDF, DOCX, PPTX, or TXT files.')
    }
  }

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile && isFileSupported(selectedFile.type, selectedFile.name)) {
      handleFileUpload(selectedFile)
    } else if (selectedFile) {
      setError('Unsupported file type. Please upload PDF, DOCX, PPTX, or TXT files.')
    }
  }

  const handleFileUpload = async (uploadedFile) => {
    if (uploadedFile.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum size is 100MB')
      return
    }
    
    // FIRST: Abort any ongoing TTS stream
    abortTTSStream()
    
    // SECOND: Stop any ongoing playback completely
    stoppedRef.current = true
    playbackIdRef.current += 1
    isPlayingRef.current = false
    if (currentSourceRef.current) {
      try { 
        currentSourceRef.current.onended = null
        currentSourceRef.current.stop() 
      } catch (e) {}
      currentSourceRef.current = null
    }
    audioQueueRef.current = []
    
    // Reset all state
    setFile(uploadedFile)
    setIsUploading(true)
    setError('')
    setExtractedText('')
    setRawText('')
    setDocumentStats(null)
    setEntities(null)
    setAudioUrl(null)
    setAllAudioChunks([])
    setTextChunks([])
    setIsStreamingComplete(false)
    setStreamingProgress({ current: 0, total: 0, text: '' })
    setCurrentChunkIndex(0)
    setIsPlaying(false)
    setIsPaused(false)
    setIsConverting(false)
  // Force remount of text display to ensure previous DOM is cleared
  setUiResetKey(k => k + 1)

    try {
      if (token) {
        // Pass false for remove_stopwords to keep all meaningful words
        const response = await documentService.uploadDocument(uploadedFile, applyNlp, false, optimizeTts)
        const data = response.data
        setExtractedText(data.text || data.processed_text || '')
        setRawText(data.raw_text || data.text || '')
        setDocumentStats({
          originalChars: data.original_character_count,
          originalWords: data.original_word_count,
          processedChars: data.processed_character_count,
          processedWords: data.processed_word_count,
          sentences: data.sentence_count,
          reductionRatio: data.reduction_ratio,
          pageCount: data.page_count || data.pages_count || data.slides_count || data.paragraphs_count || data.lines_count,
          countType: data.pages_count ? 'pages' : data.slides_count ? 'slides' : data.paragraphs_count ? 'paragraphs' : 'lines'
        })
        if (data.entities) setEntities(data.entities)
      } else {
        setError('Please log in to use document processing features')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to process document')
    }
    setIsUploading(false)
  }

  const handleConvertStreaming = async () => {
    const textToConvert = showRawText ? rawText : extractedText
    if (!textToConvert || !ttsStatus?.available) return
    
    // Abort any previous TTS stream first
    abortTTSStream()
    
    setIsConverting(true)
    setError('')
    setAudioUrl(null)
    setAllAudioChunks([])
    setTextChunks([])
    setIsStreamingComplete(false)
    setStreamingProgress({ current: 0, total: 0, text: '' })
    setCurrentChunkIndex(0)
    audioQueueRef.current = []
    isPlayingRef.current = false
    stoppedRef.current = false
    playbackIdRef.current += 1 // New playback session
    setIsPaused(false)
    
    getAudioContext()
    
    // Create new AbortController for this stream
    abortControllerRef.current = new AbortController()
    
    await ttsService.generateSpeechStreamChunks(
      textToConvert,
      selectedVoice?.id || null,
      { 
        exaggeration: voiceSettings.exaggeration, 
        cfgWeight: voiceSettings.cfgWeight, 
        temperature: voiceSettings.temperature 
      },
      handleAudioChunk,
      handleStreamingComplete,
      handleStreamingError,
      abortControllerRef.current.signal // Pass abort signal
    )
  }

  const handleConvertNonStreaming = async () => {
    const textToConvert = showRawText ? rawText : extractedText
    if (!textToConvert || !ttsStatus?.available) return
    setIsConverting(true)
    setError('')
    setAudioUrl(null)
    try {
      const response = await ttsService.generateSpeech(textToConvert, selectedVoice?.id || null, { 
        exaggeration: voiceSettings.exaggeration, 
        cfgWeight: voiceSettings.cfgWeight, 
        temperature: voiceSettings.temperature 
      })
      setAudioUrl(response.data.audio_url)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to convert document to audio')
    }
    setIsConverting(false)
  }

  const handleConvert = () => {
    if (useStreaming) {
      handleConvertStreaming()
    } else {
      handleConvertNonStreaming()
    }
  }

  // Helper to fully stop any current playback
  const stopCurrentPlayback = useCallback(() => {
    // Set stopped flag FIRST to prevent any callbacks from restarting
    stoppedRef.current = true
    // Invalidate current playback session
    playbackIdRef.current += 1
    isPlayingRef.current = false
    
    // Stop current audio source
    if (currentSourceRef.current) {
      try { 
        currentSourceRef.current.onended = null // Remove callback first
        currentSourceRef.current.stop() 
      } catch (e) {}
      currentSourceRef.current = null
    }
  }, [])

  const handlePlayPause = async () => {
    if (isPlaying) {
      // Pause playback
      stopCurrentPlayback()
      setIsPaused(true)
      setIsPlaying(false)
    } else {
      // Resume or replay - first ensure any lingering playback is stopped
      stopCurrentPlayback()
      
      const ctx = getAudioContext()
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      
      // If streaming is complete and queue is empty, replay from stored chunks
      if (isStreamingComplete && audioQueueRef.current.length === 0 && allAudioChunks.length > 0) {
        // Rebuild the queue from all stored chunks for replay
        audioQueueRef.current = allAudioChunks.map((chunk) => ({
          audioData: chunk.audioData,
          index: chunk.index,
          text: chunk.text
        }))
        setCurrentChunkIndex(0)
      }
      
      // Start fresh session after a microtask to ensure old callbacks cleared
      setTimeout(() => {
        stoppedRef.current = false
        playbackIdRef.current += 1
        const sessionId = playbackIdRef.current
        isPlayingRef.current = true
        setIsPaused(false)
        setIsPlaying(true)
        playNextChunk(sessionId)
      }, 10)
    }
  }

  const handleStop = () => {
    // Abort any ongoing TTS stream generation
    abortTTSStream()
    
    stopCurrentPlayback()
    
    // Clear the playback queue but keep stored chunks for replay
    audioQueueRef.current = []
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentChunkIndex(0)
  }

  // Jump to specific chunk when clicking on text
  const handleChunkClick = async (chunkIndex) => {
    if (allAudioChunks.length === 0) return
    
    // Fully stop current playback first
    stopCurrentPlayback()
    
    // Build queue from clicked chunk onwards
    const chunksToPlay = allAudioChunks.slice(chunkIndex).map((chunk) => ({
      audioData: chunk.audioData,
      index: chunk.index,
      text: chunk.text
    }))
    
    audioQueueRef.current = chunksToPlay
    setCurrentChunkIndex(chunkIndex)
    
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    
    // Start new playback session after a microtask delay
    setTimeout(() => {
      stoppedRef.current = false
      playbackIdRef.current += 1
      const sessionId = playbackIdRef.current
      isPlayingRef.current = true
      setIsPlaying(true)
      setIsPaused(false)
      playNextChunk(sessionId)
    }, 10)
  }

  // Skip to previous chunk
  const handlePrevChunk = () => {
    const prevIndex = Math.max(0, currentChunkIndex - 1)
    if (allAudioChunks.length > 0) {
      handleChunkClick(prevIndex)
    }
  }

  // Skip to next chunk
  const handleNextChunk = () => {
    const nextIndex = Math.min(allAudioChunks.length - 1, currentChunkIndex + 1)
    if (allAudioChunks.length > 0) {
      handleChunkClick(nextIndex)
    }
  }

  const handleDownload = async () => {
    if (useStreaming && allAudioChunks.length > 0) {
      const audioDataArrays = allAudioChunks.map(chunk => chunk.audioData)
      const blob = new Blob(audioDataArrays, { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'document_voiceover_' + Date.now() + '.wav'
      link.click()
      URL.revokeObjectURL(url)
    } else if (audioUrl) {
      const link = document.createElement('a')
      link.href = audioUrl
      link.download = 'document_voiceover_' + Date.now() + '.wav'
      link.click()
    }
  }

  const handleClear = () => {
    // FIRST: Abort any ongoing TTS stream
    abortTTSStream()
    
    // SECOND: Stop any ongoing playback completely
    stoppedRef.current = true
    playbackIdRef.current += 1
    isPlayingRef.current = false
    if (currentSourceRef.current) {
      try { 
        currentSourceRef.current.onended = null
        currentSourceRef.current.stop() 
      } catch (e) {}
      currentSourceRef.current = null
    }
    audioQueueRef.current = []
    
    // Reset all state
    setFile(null)
    setExtractedText('')
    setRawText('')
    setError('')
    setIsPlaying(false)
    setIsPaused(false)
    setIsConverting(false)
    setAudioUrl(null)
    setDocumentStats(null)
    setEntities(null)
    setAllAudioChunks([])
    setTextChunks([])
    setIsStreamingComplete(false)
    setStreamingProgress({ current: 0, total: 0, text: '' })
    setCurrentChunkIndex(0)
    // Force remount of text display to ensure previous DOM is cleared
    setUiResetKey(k => k + 1)
  }

  const fileInfo = file ? getFileInfo(file) : null

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            Document Voiceover
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-primary-500 to-indigo-500 text-white">
              <Sparkles className="w-3 h-3 mr-1" />NLP Enhanced
            </span>
            {useStreaming && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-green-500 to-emerald-500 text-white">
                <Zap className="w-3 h-3 mr-1" />Streaming
              </span>
            )}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Convert documents to natural speech with {useStreaming ? 'instant streaming playback' : 'batch processing'}</p>
        </div>
        <div className={'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ' + (ttsStatus?.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
          {ttsStatus?.available ? (<><CheckCircle className="w-4 h-4" /><span>TTS Ready ({ttsStatus?.device})</span></>) : (<><AlertCircle className="w-4 h-4" /><span>TTS Unavailable</span></>)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {!file && (
            <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className={'card cursor-pointer transition-all ' + (isDragging ? 'border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'hover:border-gray-300 dark:hover:border-gray-600')}>
              <div className="py-16 text-center">
                <Upload className={'w-16 h-16 mx-auto mb-4 ' + (isDragging ? 'text-primary-500' : 'text-gray-400')} />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Upload Document</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">Drag and drop your file here, or click to browse</p>
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {Object.values(SUPPORTED_FORMATS).map((format, idx) => (
                    <span key={idx} className="inline-flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300"><span className="mr-1">{format.icon}</span>{format.ext}</span>
                  ))}
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-500">Maximum file size: 100MB</p>
              </div>
              <input ref={fileInputRef} type="file" accept={getAcceptedTypes()} onChange={handleFileSelect} className="hidden" />
            </div>
          )}

          {file && fileInfo && (
            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-2xl">{fileInfo.icon}</div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{file.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{fileInfo.name} • {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button onClick={handleClear} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </div>
          )}

          {isUploading && (
            <div className="card"><div className="py-8 text-center"><Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" /><p className="text-gray-600 font-medium">Processing document with NLP...</p><p className="text-sm text-gray-400 mt-1">Extracting text, removing noise, optimizing for TTS</p></div></div>
          )}

          {documentStats && (
            <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800/30">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2"><Zap className="w-5 h-5 text-indigo-600" />Document Analysis</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-white dark:bg-gray-700/50 rounded-lg"><p className="text-2xl font-bold text-primary-600">{documentStats.pageCount || '-'}</p><p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{documentStats.countType}</p></div>
                <div className="text-center p-3 bg-white dark:bg-gray-700/50 rounded-lg"><p className="text-2xl font-bold text-primary-600">{documentStats.originalWords?.toLocaleString()}</p><p className="text-xs text-gray-500 dark:text-gray-400">Original Words</p></div>
                <div className="text-center p-3 bg-white dark:bg-gray-700/50 rounded-lg"><p className="text-2xl font-bold text-green-600">{documentStats.processedWords?.toLocaleString()}</p><p className="text-xs text-gray-500 dark:text-gray-400">Processed Words</p></div>
                <div className="text-center p-3 bg-white dark:bg-gray-700/50 rounded-lg"><p className="text-2xl font-bold text-indigo-600">{documentStats.reductionRatio}%</p><p className="text-xs text-gray-500 dark:text-gray-400">Reduction</p></div>
              </div>
            </div>
          )}

          {entities && (entities.persons?.length > 0 || entities.organizations?.length > 0 || entities.locations?.length > 0 || entities.key_terms?.length > 0) && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary-600" />Extracted Entities</h3>
              <div className="space-y-3">
                {entities.persons?.length > 0 && (<div className="flex items-start gap-2"><Users className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" /><div className="flex flex-wrap gap-1">{entities.persons.slice(0, 10).map((person, idx) => (<span key={idx} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">{person}</span>))}</div></div>)}
                {entities.organizations?.length > 0 && (<div className="flex items-start gap-2"><FileText className="w-4 h-4 text-purple-500 mt-1 flex-shrink-0" /><div className="flex flex-wrap gap-1">{entities.organizations.slice(0, 10).map((org, idx) => (<span key={idx} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">{org}</span>))}</div></div>)}
                {entities.locations?.length > 0 && (<div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-green-500 mt-1 flex-shrink-0" /><div className="flex flex-wrap gap-1">{entities.locations.slice(0, 10).map((loc, idx) => (<span key={idx} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">{loc}</span>))}</div></div>)}
                {entities.key_terms?.length > 0 && (<div className="flex items-start gap-2"><Sparkles className="w-4 h-4 text-amber-500 mt-1 flex-shrink-0" /><div className="flex flex-wrap gap-1">{entities.key_terms.slice(0, 15).map((term, idx) => (<span key={idx} className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs rounded-full">{term}</span>))}</div></div>)}
              </div>
            </div>
          )}

          {extractedText && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{showRawText ? 'Raw Text' : 'Processed Text (TTS Optimized)'}</h2>
                <div className="flex items-center gap-3">
                  {rawText && rawText !== extractedText && (<button onClick={() => setShowRawText(!showRawText)} className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700">Show {showRawText ? 'Processed' : 'Raw'}</button>)}
                  <span className="text-sm text-gray-500 dark:text-gray-400">{(showRawText ? rawText : extractedText).length.toLocaleString()} chars</span>
                </div>
              </div>
              
              {/* Show clickable text chunks when audio is available */}
              {textChunks.length > 0 && !showRawText ? (
                <div key={uiResetKey} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 max-h-96 overflow-y-auto">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                    <Volume2 className="w-4 h-4" />
                    Click on any text section to play from that point
                  </div>
                  <div className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                    {textChunks.map((chunk, idx) => (
                      <span
                        key={idx}
                        onClick={() => handleChunkClick(chunk.index)}
                        className={
                          'cursor-pointer px-0.5 py-0.5 rounded transition-all ' +
                          (currentChunkIndex === chunk.index && isPlaying
                            ? 'bg-green-200 dark:bg-green-800/50 text-green-900 dark:text-green-200 font-medium'
                            : currentChunkIndex === chunk.index
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-200'
                            : 'hover:bg-primary-50 dark:hover:bg-primary-900/20')
                        }
                        title={'Click to play from chunk ' + (idx + 1)}
                      >
                        {chunk.text}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={uiResetKey} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 max-h-96 overflow-y-auto">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">{showRawText ? rawText : extractedText}</p>
                </div>
              )}
              
              <div className="mt-6 space-y-4">
                {isConverting && useStreaming && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800/30">
                    <div className="flex items-center gap-3 mb-2">
                      <Volume2 className="w-5 h-5 text-green-600 animate-pulse" />
                      <span className="text-green-700 font-medium">
                        {isPlaying ? 'Playing audio...' : 'Generating audio chunks...'}
                      </span>
                    </div>
                    <div className="text-sm text-green-600 mb-2">
                      Chunk {streamingProgress.current} {streamingProgress.total > 0 && ('/ ' + streamingProgress.total)}
                    </div>
                    {streamingProgress.text && (
                      <div className="text-xs text-gray-500 italic truncate">"{streamingProgress.text}"</div>
                    )}
                    <div className="mt-2 h-2 bg-green-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
                        style={{ width: streamingProgress.total > 0 ? ((streamingProgress.current / streamingProgress.total) * 100) + '%' : '0%' }}
                      />
                    </div>
                  </div>
                )}

                {(isPlaying || isStreamingComplete || allAudioChunks.length > 0) && useStreaming && (
                  <div className="bg-gray-900 rounded-xl p-4">
                    {/* Progress bar showing current chunk */}
                    {allAudioChunks.length > 0 && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Chunk {currentChunkIndex + 1} / {allAudioChunks.length}</span>
                          <span>{isPlaying ? 'Playing' : isPaused ? 'Paused' : 'Stopped'}</span>
                        </div>
                        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
                            style={{ width: ((currentChunkIndex + 1) / allAudioChunks.length * 100) + '%' }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Audio visualizer */}
                    <div className="flex items-center justify-center h-16 gap-1 mb-4">
                      {Array.from({ length: 30 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={'w-1 rounded-full transition-all duration-150 ' + (isPlaying ? 'bg-gradient-to-t from-green-500 to-emerald-400' : 'bg-gray-700')} 
                          style={{ height: isPlaying ? (Math.random() * 50 + 20) + '%' : '20%' }} 
                        />
                      ))}
                    </div>
                    
                    {/* Control buttons */}
                    <div className="flex items-center justify-center gap-3">
                      <button 
                        onClick={handleStop} 
                        className="p-2 bg-gray-700 hover:bg-red-600 rounded-full transition-colors"
                        title="Stop"
                      >
                        <Square className="w-4 h-4 text-white" />
                      </button>
                      <button 
                        onClick={handlePrevChunk} 
                        disabled={allAudioChunks.length === 0}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors disabled:opacity-50"
                        title="Previous chunk"
                      >
                        <SkipBack className="w-4 h-4 text-white" />
                      </button>
                      <button 
                        onClick={handlePlayPause} 
                        className="p-3 bg-green-600 hover:bg-green-700 rounded-full transition-colors"
                        title={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
                      </button>
                      <button 
                        onClick={handleNextChunk} 
                        disabled={allAudioChunks.length === 0}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors disabled:opacity-50"
                        title="Next chunk"
                      >
                        <SkipForward className="w-4 h-4 text-white" />
                      </button>
                      <button 
                        onClick={handleDownload} 
                        disabled={allAudioChunks.length === 0} 
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors disabled:opacity-50"
                        title="Download audio"
                      >
                        <Download className="w-4 h-4 text-white" />
                      </button>
                    </div>
                    
                    {isStreamingComplete && (
                      <p className="text-center text-gray-400 text-xs mt-3">
                        {allAudioChunks.length} chunks • Click on text above to jump to any section
                      </p>
                    )}
                  </div>
                )}

                {audioUrl && !useStreaming && (
                  <div className="bg-gray-900 rounded-xl p-4">
                    <audio controls src={audioUrl} className="w-full" />
                    <div className="flex justify-center mt-3">
                      <button onClick={handleDownload} className="btn-secondary text-sm flex items-center gap-2">
                        <Download className="w-4 h-4" /> Download Audio
                      </button>
                    </div>
                  </div>
                )}

                {!isConverting && !isPlaying && !isStreamingComplete && (
                  <button 
                    onClick={handleConvert} 
                    disabled={!ttsStatus?.available} 
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    {useStreaming ? 'Convert & Play (Streaming)' : 'Convert to Audio'}
                  </button>
                )}

                {(isStreamingComplete || audioUrl) && !isConverting && (
                  <button 
                    onClick={handleConvert} 
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    Regenerate Audio
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (<div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2"><AlertCircle className="w-5 h-5 flex-shrink-0" />{error}</div>)}
        </div>

        <div className="space-y-6">
          <div className="card bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-green-600" />
                  Streaming Mode
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {useStreaming 
                    ? 'Audio plays immediately as it generates' 
                    : 'Wait for full audio before playback'}
                </p>
              </div>
              <button
                onClick={() => setUseStreaming(!useStreaming)}
                className={'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' + (useStreaming ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600')}
              >
                <span className={'inline-block h-4 w-4 transform rounded-full bg-white transition-transform ' + (useStreaming ? 'translate-x-6' : 'translate-x-1')} />
              </button>
            </div>
          </div>

          <div className="card">
            <button onClick={() => setShowAdvancedOptions(!showAdvancedOptions)} className="w-full flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Settings className="w-5 h-5" />Processing Options</h2>
              {showAdvancedOptions ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            {showAdvancedOptions && (
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={applyNlp} onChange={(e) => setApplyNlp(e.target.checked)} className="w-4 h-4 text-primary-600 rounded" /><div><p className="text-sm font-medium text-gray-700 dark:text-gray-300">Clean Text for TTS</p><p className="text-xs text-gray-500 dark:text-gray-400">Remove unpronouncenable characters and symbols</p></div></label>
                <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={optimizeTts} onChange={(e) => setOptimizeTts(e.target.checked)} disabled={!applyNlp} className="w-4 h-4 text-primary-600 rounded disabled:opacity-50" /><div><p className="text-sm font-medium text-gray-700 dark:text-gray-300">Expand Abbreviations</p><p className="text-xs text-gray-500 dark:text-gray-400">Convert Dr. to Doctor, etc. for better speech</p></div></label>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Select Voice</h2>
            <button onClick={() => setSelectedVoice(null)} className={'w-full flex items-center gap-3 p-3 rounded-lg border transition-all mb-4 ' + (!selectedVoice ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50')}>
              <div className={'w-10 h-10 rounded-full flex items-center justify-center ' + (!selectedVoice ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600')}><Sparkles className={'w-5 h-5 ' + (!selectedVoice ? 'text-white' : 'text-gray-500 dark:text-gray-400')} /></div>
              <div className="text-left flex-1"><p className="font-medium text-gray-900 dark:text-gray-100">Chatterbox Default</p><p className="text-xs text-gray-500 dark:text-gray-400">Built-in natural voice</p></div>
            </button>
            {clonedVoices.length > 0 && (
              <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">My Cloned Voices</p><div className="space-y-2">{clonedVoices.map((voice) => (
                <button key={voice.id} onClick={() => setSelectedVoice(voice)} className={'w-full flex items-center gap-3 p-3 rounded-lg border transition-all ' + (selectedVoice?.id === voice.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50')}>
                  <div className={'w-10 h-10 rounded-full flex items-center justify-center ' + (selectedVoice?.id === voice.id ? 'bg-gradient-to-br from-primary-600 to-indigo-600' : 'bg-gradient-to-br from-primary-400 to-indigo-400')}><span className="text-white font-medium text-sm">{voice.name[0].toUpperCase()}</span></div>
                  <div className="text-left flex-1"><p className="font-medium text-gray-900 dark:text-gray-100">{voice.name}</p><p className="text-xs text-gray-500 dark:text-gray-400">{voice.description || 'Cloned voice'}</p></div>
                </button>
              ))}</div></div>
            )}
            {clonedVoices.length === 0 && (<div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm"><p>No cloned voices yet.</p><p className="mt-1"><a href="/voice-cloning" className="text-primary-600 dark:text-primary-400 hover:underline">Clone a voice</a></p></div>)}
          </div>

          {/* Voice Controls Card */}
          <div className="card">
            <button 
              onClick={() => setShowVoiceControls(!showVoiceControls)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Voice Controls</h2>
              </div>
              {showVoiceControls ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            
            {showVoiceControls && (
              <div className="mt-4 space-y-5">
                {/* Speed/Pace Control */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Speed / Pace</label>
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      {voiceSettings.cfgWeight <= 0.3 ? 'Slow' : voiceSettings.cfgWeight <= 0.6 ? 'Normal' : 'Fast'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.1"
                    value={voiceSettings.cfgWeight}
                    onChange={(e) => setVoiceSettings(prev => ({ ...prev, cfgWeight: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <span>Slower</span>
                    <span>Faster</span>
                  </div>
                </div>

                {/* Emotion/Expression Control */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Expression</label>
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      {voiceSettings.exaggeration <= 0.3 ? 'Calm' : voiceSettings.exaggeration <= 0.6 ? 'Natural' : 'Expressive'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={voiceSettings.exaggeration}
                    onChange={(e) => setVoiceSettings(prev => ({ ...prev, exaggeration: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <span>Calm</span>
                    <span>Expressive</span>
                  </div>
                </div>

                {/* Variation/Temperature Control */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Variation</label>
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      {voiceSettings.temperature <= 0.5 ? 'Consistent' : voiceSettings.temperature <= 1.0 ? 'Natural' : 'Creative'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="1.5"
                    step="0.1"
                    value={voiceSettings.temperature}
                    onChange={(e) => setVoiceSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <span>Consistent</span>
                    <span>Varied</span>
                  </div>
                </div>

                {/* Reset Button */}
                <button
                  onClick={() => setVoiceSettings({ exaggeration: 0.5, cfgWeight: 0.3, temperature: 0.8 })}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                >
                  Reset to defaults
                </button>
              </div>
            )}
          </div>

          <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800/30">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Tips</h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span><strong>Streaming mode</strong> plays audio instantly as chunks generate - no waiting!</span>
              </li>
              <li>Supports PDF, DOCX, PPTX, and TXT (up to 100MB)</li>
              <li>NLP removes noise and optimizes for natural speech</li>
              <li>Use cloned voices for personalized audio</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
