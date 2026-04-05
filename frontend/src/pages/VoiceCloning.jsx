import { useState, useRef, useCallback, useEffect } from 'react'
import { 
  Mic, 
  Upload, 
  Play, 
  Pause, 
  Loader2, 
  Trash2, 
  Volume2,
  StopCircle,
  Clock,
  Sparkles,
  Info,
  CheckCircle,
  AlertCircle,
  Wand2
} from 'lucide-react'
import { useVoice } from '../contexts/VoiceContext'

export default function VoiceCloning() {
  const { clonedVoices, cloneVoice, deleteVoice, isLoading } = useVoice()
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioLevel, setAudioLevel] = useState(0)  // Audio level indicator
  
  // Upload state
  const [uploadedFile, setUploadedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  
  // Form state
  const [voiceName, setVoiceName] = useState('')
  const [voiceDescription, setVoiceDescription] = useState('')
  const [isCloning, setIsCloning] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false)

  // Refs
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const fileInputRef = useRef(null)
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const streamRef = useRef(null)

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Start recording with enhanced noise cancellation
  const startRecording = async () => {
    try {
      // Request microphone with maximum noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          // Core noise cancellation features
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          
          // Audio quality settings
          sampleRate: { ideal: 48000 },  // Higher sample rate for better quality
          sampleSize: { ideal: 16 },      // 16-bit audio
          channelCount: { ideal: 1 },     // Mono for voice
          
          // Advanced constraints (if supported)
          latency: { ideal: 0 },
          
          // Try to get consistent audio
          googEchoCancellation: { ideal: true },
          googAutoGainControl: { ideal: true },
          googNoiseSuppression: { ideal: true },
          googHighpassFilter: { ideal: true },
        } 
      })
      
      // Store stream reference for cleanup
      streamRef.current = stream
      
      // Log actual constraints applied
      const audioTrack = stream.getAudioTracks()[0]
      const settings = audioTrack.getSettings()
      console.log('Audio settings applied:', settings)
      
      // Set up audio processing pipeline with Web Audio API
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000
      })
      
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream)
      
      // Create audio processing chain for noise reduction
      // 1. High-pass filter to remove low-frequency rumble (below 80Hz)
      const highpassFilter = audioContextRef.current.createBiquadFilter()
      highpassFilter.type = 'highpass'
      highpassFilter.frequency.value = 80
      highpassFilter.Q.value = 0.7
      
      // 2. Low-pass filter to remove high-frequency hiss (above 12kHz)
      const lowpassFilter = audioContextRef.current.createBiquadFilter()
      lowpassFilter.type = 'lowpass'
      lowpassFilter.frequency.value = 12000
      lowpassFilter.Q.value = 0.7
      
      // 3. Notch filter to reduce common electrical hum (50/60Hz)
      const notchFilter = audioContextRef.current.createBiquadFilter()
      notchFilter.type = 'notch'
      notchFilter.frequency.value = 50  // 50Hz for EU, change to 60 for US
      notchFilter.Q.value = 30
      
      // 4. Compressor to normalize volume levels
      const compressor = audioContextRef.current.createDynamicsCompressor()
      compressor.threshold.value = -24    // Start compressing at -24dB
      compressor.knee.value = 12          // Soft knee for natural sound
      compressor.ratio.value = 4          // 4:1 compression ratio
      compressor.attack.value = 0.003     // Fast attack (3ms)
      compressor.release.value = 0.25     // Medium release (250ms)
      
      // 5. Gain stage for final level adjustment
      const gainNode = audioContextRef.current.createGain()
      gainNode.gain.value = 1.2  // Slight boost to compensate for filtering
      
      // Connect the processing chain
      source.connect(highpassFilter)
      highpassFilter.connect(lowpassFilter)
      lowpassFilter.connect(notchFilter)
      notchFilter.connect(compressor)
      compressor.connect(gainNode)
      
      // Create a destination for the processed audio
      const destination = audioContextRef.current.createMediaStreamDestination()
      gainNode.connect(destination)
      
      // Also connect to analyser for level monitoring (from processed signal)
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      gainNode.connect(analyserRef.current)
      
      // Start monitoring audio levels
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setAudioLevel(Math.min(100, average * 1.5))  // Scale to 0-100
          animationFrameRef.current = requestAnimationFrame(updateLevel)
        }
      }
      updateLevel()
      
      // Use the PROCESSED audio stream for recording
      const processedStream = destination.stream
      
      // Check for supported MIME types
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4'
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '' // Let browser choose default
          }
        }
      }
      
      console.log('Using MIME type:', mimeType || 'browser default')
      console.log('Recording with enhanced noise cancellation enabled')
      
      const options = mimeType ? { mimeType } : {}
      // Record from the PROCESSED stream, not the raw stream
      mediaRecorderRef.current = new MediaRecorder(processedStream, options)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log('Data available:', event.data?.size, 'bytes')
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        // Stop audio level monitoring
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        setAudioLevel(0)
        
        // Stop all tracks (original stream)
        stream.getTracks().forEach(track => track.stop())
        
        // Close audio context
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close()
        }
        
        if (audioChunksRef.current.length === 0) {
          setError('Recording failed - no audio data captured. Please check your microphone.')
          return
        }
        
        const blob = new Blob(audioChunksRef.current, { 
          type: mediaRecorderRef.current.mimeType || 'audio/webm' 
        })
        
        if (blob.size === 0) {
          setError('Recording failed - empty audio file. Please try again.')
          return
        }
        
        console.log('Recording complete:', blob.size, 'bytes,', audioChunksRef.current.length, 'chunks')
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
      }

      mediaRecorderRef.current.onerror = (event) => {
        console.error('MediaRecorder error:', event.error)
        setError('Recording error: ' + (event.error?.message || 'Unknown error'))
        stream.getTracks().forEach(track => track.stop())
      }

      // Start recording with timeslice to collect data every 100ms
      // This ensures we get audio chunks regularly instead of only at the end
      mediaRecorderRef.current.start(100)
      setIsRecording(true)
      setRecordingTime(0)
      setError('')

      // Timer - no auto-stop, user controls when to stop
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Microphone access error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone access denied. Please allow microphone access in your browser settings.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Microphone is in use by another application. Please close other apps using the microphone.')
      } else {
        setError('Microphone error: ' + (err.message || 'Unknown error'))
      }
    }
  }

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Request any remaining data before stopping
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.requestData()
      }
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      clearInterval(timerRef.current)
    }
  }, [])

  // Handle file drop
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files[0]
    // Accept any audio file type
    if (file && (file.type.includes('audio') || file.name.match(/\.(wav|mp3|m4a|aac|ogg|flac|webm|wma|aiff|opus)$/i))) {
      setUploadedFile(file)
      setAudioUrl(URL.createObjectURL(file))
      setAudioBlob(file)
      setError('')
    } else {
      setError('Please upload a valid audio file (WAV, MP3, M4A, FLAC, OGG, etc.)')
    }
  }, [])

  // Handle file select
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setUploadedFile(file)
      setAudioUrl(URL.createObjectURL(file))
      setAudioBlob(file)
      setError('')
    }
  }

  // Play/pause audio preview
  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
    }
  }

  // Clone voice
  const handleClone = async () => {
    if (!voiceName.trim()) {
      setError('Please enter a name for your voice')
      return
    }
    if (!audioBlob) {
      setError('Please record or upload an audio sample')
      return
    }

    setIsCloning(true)
    setError('')
    setSuccess('')

    const result = await cloneVoice(voiceName, voiceDescription, audioBlob)
    
    if (result.success) {
      setSuccess(`Voice "${voiceName}" cloned successfully! You can now use it in Voice Studio.`)
      setVoiceName('')
      setVoiceDescription('')
      setAudioBlob(null)
      setAudioUrl(null)
      setUploadedFile(null)
      setRecordingTime(0)
    } else {
      setError(result.error)
    }

    setIsCloning(false)
  }

  // Reset form
  const handleReset = () => {
    setAudioBlob(null)
    setAudioUrl(null)
    setUploadedFile(null)
    setRecordingTime(0)
    setError('')
    setSuccess('')
    setIsPlaying(false)
  }

  // Delete voice
  const handleDelete = async (voiceId, voiceName) => {
    if (window.confirm(`Are you sure you want to delete "${voiceName}"?`)) {
      await deleteVoice(voiceId)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
          Voice Cloning
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-primary-500 to-indigo-500 text-white">
            <Sparkles className="w-3 h-3 mr-1" />
            Chatterbox
          </span>
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Clone any voice from a short audio sample using state-of-the-art AI</p>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 border border-primary-100 dark:border-primary-800/30 rounded-xl p-4 flex items-start gap-4">
        <div className="p-2 bg-white dark:bg-gray-700 rounded-lg">
          <Wand2 className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">How Chatterbox Voice Cloning Works</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Upload or record an audio sample of clear speech. Chatterbox will analyze the voice characteristics 
            and create a cloned voice profile that you can use in Voice Studio to generate speech in that voice.
          </p>
          <ul className="text-sm text-gray-500 dark:text-gray-400 mt-2 space-y-1">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Clear audio without background noise works best
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-yellow-500" />
              <span><strong>Tip:</strong> 3-10 seconds of audio produces the best results</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Natural speaking pace produces better results
            </li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Voice Input Section */}
        <div className="space-y-6">
          {/* Recording Card */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Mic className="w-5 h-5 text-primary-600" />
              Record Audio
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Record an audio sample of the voice you want to clone. For best results, use 3-10 seconds of clear speech.
            </p>

            <div className="flex flex-col items-center">
              {/* Recording Button */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isCloning}
                className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                    : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {isRecording ? (
                  <StopCircle className="w-10 h-10 text-white" />
                ) : (
                  <Mic className="w-10 h-10 text-white" />
                )}
              </button>

              {/* Audio Level Meter - Shows if mic is working */}
              {isRecording && (
                <div className="mt-4 w-full max-w-xs">
                  {/* Noise Cancellation Active Indicator */}
                  <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700 text-xs">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="font-medium">Enhanced Noise Cancellation Active</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1 ml-4">
                      Filtering: Background noise • Echo • Electrical hum
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" />
                      Processed Audio Level
                    </span>
                    <span className={`text-xs font-medium ${audioLevel > 10 ? 'text-green-600' : 'text-red-500'}`}>
                      {audioLevel > 10 ? '✓ Clean audio' : '✗ No audio detected'}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-75 rounded-full ${
                        audioLevel > 60 ? 'bg-red-500' : 
                        audioLevel > 30 ? 'bg-yellow-500' : 
                        audioLevel > 10 ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                      style={{ width: `${Math.max(2, audioLevel)}%` }}
                    />
                  </div>
                  {audioLevel <= 10 && (
                    <p className="text-xs text-red-500 mt-1 text-center">
                      ⚠️ Speak louder or check your microphone settings
                    </p>
                  )}
                </div>
              )}

              {/* Recording Time */}
              <div className="mt-4 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4" />
                <span className="font-mono text-lg">{recordingTime}s</span>
              </div>

              {/* Quality indicator */}
              <div className="flex items-center gap-4 mt-3 text-xs">
                <span className={`flex items-center gap-1 ${recordingTime >= 3 ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${recordingTime >= 3 ? 'bg-green-500' : 'bg-gray-300'}`} />
                  Good (3s+)
                </span>
                <span className={`flex items-center gap-1 ${recordingTime >= 5 ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${recordingTime >= 5 ? 'bg-green-500' : 'bg-gray-300'}`} />
                  Better (5s+)
                </span>
                <span className={`flex items-center gap-1 ${recordingTime >= 10 ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${recordingTime >= 10 ? 'bg-green-500' : 'bg-gray-300'}`} />
                  Excellent (10s+)
                </span>
              </div>

              {/* Recommendation message for long recordings */}
              {recordingTime > 15 && (
                <p className="text-xs text-yellow-600 mt-2 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Tip: 3-10 seconds usually gives the best results
                </p>
              )}

              <p className="text-xs text-gray-400 mt-2">
                {isRecording ? 'Recording... Click to stop when done' : 'Click to start recording'}
              </p>
            </div>
          </div>

          {/* Upload Card */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary-600" />
              Or Upload Audio
            </h2>
            
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragging 
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/30'
              }`}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-primary-500' : 'text-gray-400'}`} />
              <p className="text-gray-600 dark:text-gray-300 font-medium">
                {uploadedFile ? uploadedFile.name : 'Drop your audio file here'}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Supports WAV, MP3, M4A, FLAC, OGG, AAC, and more</p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">💡 Tip: 3-10 seconds of clear audio works best</p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.m4a,.aac,.wma,.aiff"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Audio Preview */}
          {audioUrl && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-primary-600" />
                Audio Preview
              </h2>
              
              {/* Custom audio player */}
              <div className="bg-gray-900 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePlayback}
                    className="p-3 bg-primary-600 hover:bg-primary-700 rounded-full transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 text-white" />
                    ) : (
                      <Play className="w-5 h-5 text-white ml-0.5" />
                    )}
                  </button>
                  
                  <div className="flex-1">
                    <div className="flex items-center h-8 gap-0.5">
                      {Array.from({ length: 30 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-1 rounded-full transition-all ${
                            isPlaying ? 'bg-primary-500' : 'bg-gray-600'
                          }`}
                          style={{ height: `${Math.random() * 100}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <audio
                ref={audioRef}
                src={audioUrl}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
              
              <button
                onClick={handleReset}
                className="btn-secondary mt-4 w-full flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear Audio
              </button>
            </div>
          )}

          {/* Voice Details Form */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Voice Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Voice Name *
                </label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="input-field"
                  placeholder="e.g., My Voice Clone"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={voiceDescription}
                  onChange={(e) => setVoiceDescription(e.target.value)}
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Add a description for this voice..."
                />
              </div>
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="mt-4 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {success}
              </div>
            )}

            {/* Clone Button */}
            <button
              onClick={handleClone}
              disabled={isCloning || !audioBlob || !voiceName.trim()}
              className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
            >
              {isCloning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Voice Clone...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Clone Voice with Chatterbox
                </>
              )}
            </button>
          </div>
        </div>

        {/* Cloned Voices List */}
        <div className="card h-fit">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Your Cloned Voices</h2>
          
          {clonedVoices.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-indigo-100 dark:from-primary-900/30 dark:to-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-10 h-10 text-primary-500" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">No cloned voices yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Record or upload audio to create your first Chatterbox voice clone
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {clonedVoices.map((voice) => (
                <div 
                  key={voice.id} 
                  className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition-shadow hover:border-primary-200 dark:hover:border-primary-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {voice.name[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          {voice.name}
                          <span className="text-xs px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                            Chatterbox
                          </span>
                        </h3>
                        {voice.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{voice.description}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(voice.id, voice.name)}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Voice info */}
                  <div className="mt-4 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      Voice Cloned
                    </span>
                    {voice.audio_duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {voice.audio_duration.toFixed(1)}s sample
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                    Created: {new Date(voice.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
