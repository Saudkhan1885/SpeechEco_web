import { useState } from 'react'
import { 
  Clock, 
  Volume2, 
  MessageSquare, 
  FileText, 
  Users,
  Play,
  Trash2,
  Search
} from 'lucide-react'

// Mock history data
const mockHistory = [
  {
    id: 1,
    type: 'tts',
    title: 'Project Introduction',
    preview: 'Hello! Welcome to SpeechEcho, your advanced voice cloning...',
    voice: 'Default Male',
    createdAt: '2026-01-22T10:30:00',
    duration: '0:45'
  },
  {
    id: 2,
    type: 'clone',
    title: 'My Voice Clone',
    preview: 'Voice cloned from audio sample',
    voice: null,
    createdAt: '2026-01-22T09:15:00',
    duration: null
  },
  {
    id: 3,
    type: 'document',
    title: 'Research Paper.pdf',
    preview: 'Converted document to audio (12 pages)',
    voice: 'Default Female',
    createdAt: '2026-01-21T15:45:00',
    duration: '15:30'
  },
  {
    id: 4,
    type: 'chat',
    title: 'AI Conversation',
    preview: 'Discussed project requirements and features...',
    voice: 'Fast Reader',
    createdAt: '2026-01-21T14:20:00',
    duration: null
  },
  {
    id: 5,
    type: 'tts',
    title: 'Sample Text',
    preview: 'The quick brown fox jumps over the lazy dog...',
    voice: 'Deep Voice',
    createdAt: '2026-01-20T11:00:00',
    duration: '0:12'
  },
]

const typeIcons = {
  tts: Volume2,
  clone: Users,
  document: FileText,
  chat: MessageSquare,
}

const typeColors = {
  tts: 'bg-blue-100 text-blue-600',
  clone: 'bg-purple-100 text-purple-600',
  document: 'bg-green-100 text-green-600',
  chat: 'bg-orange-100 text-orange-600',
}

const typeLabels = {
  tts: 'Text-to-Speech',
  clone: 'Voice Clone',
  document: 'Document',
  chat: 'Chat Session',
}

export default function History() {
  const [history, setHistory] = useState(mockHistory)
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredHistory = history.filter(item => {
    const matchesFilter = filter === 'all' || item.type === filter
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.preview.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      setHistory(prev => prev.filter(item => item.id !== id))
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    
    if (diff < 86400000) { // Less than 24 hours
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diff < 604800000) { // Less than a week
      return date.toLocaleDateString([], { weekday: 'long' })
    } else {
      return date.toLocaleDateString()
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">History</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">View and manage your past activities</p>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Filter Tabs */}
        <div className="flex bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1 flex-wrap">
          {[
            { key: 'all', label: 'All' },
            { key: 'tts', label: 'TTS' },
            { key: 'clone', label: 'Clones' },
            { key: 'document', label: 'Documents' },
            { key: 'chat', label: 'Chats' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search history..."
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* History List */}
      {filteredHistory.length === 0 ? (
        <div className="card text-center py-16">
          <Clock className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No history found</h3>
          <p className="text-gray-500 dark:text-gray-400">
            {searchQuery || filter !== 'all' 
              ? 'Try adjusting your search or filter'
              : 'Your activity will appear here'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHistory.map((item) => {
            const Icon = typeIcons[item.type]
            
            return (
              <div 
                key={item.id}
                className="card hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Type Icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${typeColors[item.type]}`}>
                    <Icon className="w-6 h-6" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                          {item.preview}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.duration && (
                          <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            {item.duration}
                          </span>
                        )}
                        
                        {item.type !== 'clone' && (
                          <button className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                            <Play className="w-5 h-5" />
                          </button>
                        )}
                        
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[item.type]}`}>
                        {typeLabels[item.type]}
                      </span>
                      
                      {item.voice && (
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Volume2 className="w-4 h-4" />
                          {item.voice}
                        </span>
                      )}
                      
                      <span className="text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: history.length, icon: Clock },
          { label: 'TTS Generated', value: history.filter(h => h.type === 'tts').length, icon: Volume2 },
          { label: 'Documents', value: history.filter(h => h.type === 'document').length, icon: FileText },
          { label: 'Chat Sessions', value: history.filter(h => h.type === 'chat').length, icon: MessageSquare },
        ].map((stat, index) => (
          <div key={index} className="card text-center">
            <stat.icon className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
