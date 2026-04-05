import { useState, useEffect } from 'react'
import { 
  Mic2, 
  Users, 
  FileAudio, 
  MessageSquare, 
  TrendingUp,
  Clock,
  Volume2,
  ArrowRight
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useVoice } from '../contexts/VoiceContext'
import { authService } from '../services/api'

export default function Dashboard() {
  const { clonedVoices } = useVoice()
  const [userStats, setUserStats] = useState(null)

  useEffect(() => {
    authService.getStats()
      .then(res => setUserStats(res.data))
      .catch(() => setUserStats(null))
  }, [])

  const stats = [
    { 
      label: 'Cloned Voices', 
      value: userStats ? userStats.cloned_voices : clonedVoices.length, 
      icon: Users, 
      color: 'bg-purple-500',
    },
    { 
      label: 'TTS Generations', 
      value: userStats ? userStats.tts_generations : '—', 
      icon: Volume2, 
      color: 'bg-blue-500',
    },
    { 
      label: 'Documents Processed', 
      value: userStats ? userStats.documents_processed : '—', 
      icon: FileAudio, 
      color: 'bg-green-500',
    },
    { 
      label: 'Chat Sessions', 
      value: userStats ? userStats.chat_sessions : '—', 
      icon: MessageSquare, 
      color: 'bg-orange-500',
    },
  ]

  const quickActions = [
    { 
      title: 'Voice Cloning', 
      description: 'Clone a voice from a 5-second audio sample',
      icon: Users,
      path: '/voice-cloning',
      gradient: 'from-purple-500 to-indigo-600'
    },
    { 
      title: 'Text-to-Speech', 
      description: 'Convert text to natural sounding speech',
      icon: Mic2,
      path: '/voice-studio',
      gradient: 'from-blue-500 to-cyan-600'
    },
    { 
      title: 'Document Voiceover', 
      description: 'Convert PDF documents to audio',
      icon: FileAudio,
      path: '/document-voiceover',
      gradient: 'from-green-500 to-emerald-600'
    },
    { 
      title: 'AI Chat', 
      description: 'Have a conversation with AI using voice',
      icon: MessageSquare,
      path: '/chat',
      gradient: 'from-orange-500 to-red-600'
    },
  ]

  const recentActivity = [
    { action: 'Voice cloned', name: 'My Voice 1', time: '2 hours ago' },
    { action: 'TTS generated', name: 'Project Introduction', time: '3 hours ago' },
    { action: 'Document converted', name: 'Research Paper.pdf', time: '5 hours ago' },
    { action: 'Chat session', name: 'AI Assistant', time: '1 day ago' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Welcome to SpeechEcho - Your AI-powered voice synthesis platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="card hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {userStats === null ? (
                    <span className="text-gray-300 dark:text-gray-600 text-2xl">Loading...</span>
                  ) : (
                    stat.value
                  )}
                </p>
              </div>
              <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {quickActions.map((action, index) => (
            <Link
              key={index}
              to={action.path}
              className="group card hover:shadow-lg transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 bg-gradient-to-br ${action.gradient} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                  <action.icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{action.description}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {recentActivity.map((item, index) => (
              <div key={index} className="flex items-center gap-4 pb-4 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0">
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.action}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.name}</p>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Voice Profiles */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your Voice Profiles</h2>
            <Link to="/voice-cloning" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium">
              View all
            </Link>
          </div>
          
          {clonedVoices.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No cloned voices yet</p>
              <Link 
                to="/voice-cloning" 
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 text-sm font-medium mt-2 inline-block"
              >
                Create your first voice clone
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {clonedVoices.slice(0, 4).map((voice, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-sm">
                      {voice.name[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{voice.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Pitch: {voice.pitch_shift?.toFixed(2)} | Speed: {voice.speed_rate?.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System Status */}
      <div className="card bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 border-primary-100 dark:border-primary-800/30">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white dark:bg-gray-700 rounded-xl flex items-center justify-center shadow-sm">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">All Systems Operational</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Voice cloning, TTS, and chat services are running smoothly</p>
          </div>
        </div>
      </div>
    </div>
  )
}
