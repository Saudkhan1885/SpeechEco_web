import { useState, useRef, useEffect } from 'react'
import { 
  Volume2, 
  Play, 
  Pause, 
  Square,
  Loader2,
  Download,
  RefreshCw,
  Sparkles,
  Sliders,
  Info,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import { useVoice } from '../contexts/VoiceContext'
import { ttsService } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

export default function VoiceStudio() {
  const { clonedVoices, selectedVoice, setSelectedVoice } = useVoice()
  const { token } = useAuth()
  
  const [text, setText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [error, setError] = useState('')
  
  // Chatterbox TTS parameters
  const [exaggeration, setExaggeration] = useState(0.5)
  const [cfgWeight, setCfgWeight] = useState(0.5)
  const [temperature, setTemperature] = useState(0.8)
  const [ttsStatus, setTtsStatus] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  const audioRef = useRef(null)

  // Check TTS status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await ttsService.getStatus()
        setTtsStatus(response.data)
      } catch (err) {
        console.error('Failed to get TTS status:', err)
        setTtsStatus({ available: false, device: 'unavailable' })
      }
    }
    checkStatus()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  // Generate speech using Chatterbox
  const handleGenerate = async () => {
    if (!text.trim()) {
      setError('Please enter some text to convert')
      return
    }

    setIsGenerating(true)
    setError('')
    setAudioUrl(null)

    try {
      const response = await ttsService.generateSpeech(
        text, 
        selectedVoice?.id || null,
        {
          exaggeration,
          cfgWeight,
          temperature
        }
      )
      setAudioUrl(response.data.audio_url)
      
      // Auto-play the generated audio
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play()
        }
      }, 100)
    } catch (err) {
      console.error('TTS error:', err)
      setError(err.response?.data?.detail || 'Failed to generate speech. Please try again.')
    }

    setIsGenerating(false)
  }

  // Play/Pause audio
  const handlePlayPause = () => {
    if (audioUrl && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
    }
  }

  // Stop audio
  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsPlaying(false)
  }

  // Download audio
  const handleDownload = () => {
    if (audioUrl) {
      const link = document.createElement('a')
      link.href = audioUrl
      link.download = `chatterbox_speech_${Date.now()}.wav`
      link.click()
    }
  }

  // Sample texts
  const sampleTexts = [
    "Hello! Welcome to SpeechEcho, powered by Chatterbox - the state of the art voice cloning system.",
    "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet.",
    "Artificial intelligence is transforming how we interact with technology in profound ways.",
    "Welcome to the future of voice synthesis, where your ideas come to life through sound.",
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            Voice Studio
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-primary-500 to-indigo-500 text-white">
              <Sparkles className="w-3 h-3 mr-1" />
              Chatterbox
            </span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Convert text to natural speech with state-of-the-art AI voice cloning</p>
        </div>
        
        {/* TTS Status Indicator */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
          ttsStatus?.available 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {ttsStatus?.available ? (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>TTS Ready ({ttsStatus?.device})</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4" />
              <span>TTS Unavailable</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Text Input */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Enter Text</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {text.length} / 5000 characters
              </span>
            </div>
            
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 5000))}
              className="input-field resize-none h-48 font-mono text-sm"
              placeholder="Type or paste the text you want to convert to speech..."
            />

            {/* Sample Texts */}
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick samples:</p>
              <div className="flex flex-wrap gap-2">
                {sampleTexts.map((sample, index) => (
                  <button
                    key={index}
                    onClick={() => setText(sample)}
                    className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors"
                  >
                    Sample {index + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chatterbox Controls */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary-600" />
                Voice Controls
              </h2>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700"
              >
                {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
              </button>
            </div>

            <div className="space-y-6">
              {/* Exaggeration Control */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    Emotion Exaggeration
                    <span className="relative group">
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-48 pointer-events-none">
                        Higher values make speech more expressive and dramatic
                      </span>
                    </span>
                  </label>
                  <span className="text-sm font-mono text-primary-600 dark:text-primary-400">{exaggeration.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={exaggeration}
                  onChange={(e) => setExaggeration(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>Subtle</span>
                  <span>Balanced</span>
                  <span>Dramatic</span>
                </div>
              </div>

              {/* CFG Weight Control */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    Pacing Control (CFG)
                    <span className="relative group">
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-48 pointer-events-none">
                        Lower values for slower pacing, higher for faster speech
                      </span>
                    </span>
                  </label>
                  <span className="text-sm font-mono text-primary-600 dark:text-primary-400">{cfgWeight.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={cfgWeight}
                  onChange={(e) => setCfgWeight(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>Slow</span>
                  <span>Natural</span>
                  <span>Fast</span>
                </div>
              </div>

              {/* Advanced: Temperature */}
              {showAdvanced && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      Temperature
                      <span className="relative group">
                        <Info className="w-4 h-4 text-gray-400 cursor-help" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-48 pointer-events-none">
                          Controls randomness. Higher = more varied, lower = more consistent
                        </span>
                      </span>
                    </label>
                    <span className="text-sm font-mono text-primary-600 dark:text-primary-400">{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>Consistent</span>
                    <span>Balanced</span>
                    <span>Creative</span>
                  </div>
                </div>
              )}

              {/* Preset Buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => { setExaggeration(0.5); setCfgWeight(0.5); setTemperature(0.8); }}
                  className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors"
                >
                  Default
                </button>
                <button
                  onClick={() => { setExaggeration(0.7); setCfgWeight(0.3); setTemperature(0.9); }}
                  className="text-xs px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full transition-colors"
                >
                  Expressive
                </button>
                <button
                  onClick={() => { setExaggeration(0.3); setCfgWeight(0.6); setTemperature(0.7); }}
                  className="text-xs px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full transition-colors"
                >
                  Calm
                </button>
                <button
                  onClick={() => { setExaggeration(0.4); setCfgWeight(0.5); setTemperature(0.6); }}
                  className="text-xs px-3 py-1.5 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full transition-colors"
                >
                  Professional
                </button>
              </div>
            </div>
          </div>

          {/* Audio Player */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Audio Output</h2>
            
            {/* Waveform Visualization */}
            <div className="bg-gray-900 rounded-xl p-6 mb-4">
              <div className="flex items-center justify-center h-24 gap-1">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-150 ${
                      isPlaying 
                        ? 'bg-gradient-to-t from-primary-500 to-indigo-400' 
                        : 'bg-gray-700'
                    }`}
                    style={{
                      height: isPlaying ? `${Math.random() * 60 + 20}%` : '20%',
                      animationDelay: `${i * 0.05}s`
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleStop}
                className="p-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors"
                disabled={!audioUrl}
              >
                <Square className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
              
              <button
                onClick={handlePlayPause}
                disabled={!audioUrl}
                className="p-4 bg-primary-600 hover:bg-primary-700 rounded-full transition-colors disabled:opacity-50"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={handleDownload}
                disabled={!audioUrl}
                className="p-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors disabled:opacity-50"
              >
                <Download className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>

            {/* Hidden audio element */}
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="hidden"
              />
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim() || !ttsStatus?.available}
              className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating with Chatterbox...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Speech
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Voice Selection Sidebar */}
        <div className="space-y-6">
          {/* Voice Selection */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Select Voice</h2>
            
            {/* Default/No Voice Option */}
            <button
              onClick={() => setSelectedVoice(null)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all mb-4 ${
                !selectedVoice
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                !selectedVoice ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}>
                <Sparkles className={`w-5 h-5 ${
                  !selectedVoice ? 'text-white' : 'text-gray-500 dark:text-gray-400'
                }`} />
              </div>
              <div className="text-left flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100">Chatterbox Default</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Built-in natural voice</p>
              </div>
            </button>

            {/* Cloned Voices */}
            {clonedVoices.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">My Cloned Voices</p>
                <div className="space-y-2">
                  {clonedVoices.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        selectedVoice?.id === voice.id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        selectedVoice?.id === voice.id 
                          ? 'bg-gradient-to-br from-primary-600 to-indigo-600' 
                          : 'bg-gradient-to-br from-primary-400 to-indigo-400'
                      }`}>
                        <span className="text-white font-medium text-sm">
                          {voice.name[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{voice.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {voice.description || 'Cloned voice'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Selected Voice Info */}
          {selectedVoice && (
            <div className="card bg-gradient-to-br from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 border-primary-100 dark:border-primary-800/30">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Selected Voice</h3>
              <div className="space-y-3">
                <p className="text-lg font-bold text-primary-700 dark:text-primary-300">{selectedVoice.name}</p>
                
                {selectedVoice.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedVoice.description}</p>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700/50 rounded-lg p-2">
                  <p>This voice will be used for voice cloning. The generated speech will mimic this voice's characteristics.</p>
                </div>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="card bg-yellow-50 dark:bg-yellow-900/10 border-yellow-100 dark:border-yellow-800/30">
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Tips for Best Results
            </h3>
            <ul className="text-sm text-yellow-700 dark:text-yellow-400 space-y-1">
              <li>• Use lower CFG weight (~0.3) for slower pacing</li>
              <li>• Increase exaggeration for dramatic speech</li>
              <li>• Clone voices work best with 3-10s audio samples</li>
              <li>• Clear, noise-free recordings produce better clones</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
