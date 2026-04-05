import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, User, LogOut, ChevronDown, Settings } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const dropdownRef = useRef(null)
  const notifRef = useRef(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const notifications = [
    { id: 1, text: 'Voice cloning completed', time: '2 min ago', read: false },
    { id: 2, text: 'New voice profile available', time: '1 hour ago', read: true },
    { id: 3, text: 'System update available', time: '1 day ago', read: true },
  ]

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-20 transition-colors duration-300">
      {/* Page title area */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Welcome back, {user?.full_name || user?.username || 'User'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 animate-fade-in">
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                      !notif.read ? 'bg-primary-50/50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <p className="text-sm text-gray-900 dark:text-gray-100">{notif.text}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{notif.time}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                <button className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-white font-medium text-sm">
                    {(user?.username || 'U')[0].toUpperCase()}
                  </span>
              }
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {user?.full_name || user?.username || 'User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email || 'user@email.com'}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 animate-fade-in">
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
              </div>
              
              <div className="py-1">
                <button
                  onClick={() => { navigate('/settings'); setShowDropdown(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={() => { navigate('/settings'); setShowDropdown(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
