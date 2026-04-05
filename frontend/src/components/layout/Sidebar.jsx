import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Mic2, 
  Users, 
  FileAudio, 
  MessageSquare, 
  History, 
  Settings,
  AudioWaveform
} from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/voice-studio', icon: Mic2, label: 'Voice Studio (TTS)' },
  { path: '/voice-cloning', icon: Users, label: 'Voice Cloning' },
  { path: '/document-voiceover', icon: FileAudio, label: 'Document Voiceover' },
  { path: '/chat', icon: MessageSquare, label: 'AI Chat', badge: 'Voice' },
  { path: '/history', icon: History, label: 'History' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col z-30 transition-colors duration-300">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl flex items-center justify-center">
            <AudioWaveform className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl text-gray-900 dark:text-gray-100">SpeechEcho</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Voice Cloning System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-full">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700">
        <div className="bg-gradient-to-r from-primary-50 dark:from-primary-900/30 to-indigo-50 dark:to-indigo-900/30 rounded-xl p-4">
          <p className="text-sm font-medium text-primary-700 dark:text-primary-300">GIKI FYP Project</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Real-Time Voice Synthesis</p>
        </div>
      </div>
    </aside>
  )
}
