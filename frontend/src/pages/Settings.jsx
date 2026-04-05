import { useState, useEffect, useRef } from 'react'
import { 
  User, 
  Bell, 
  Shield, 
  Moon, 
  Globe,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  Lock,
  Camera,
  Sun
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppearance } from '../contexts/AppearanceContext'
import { authService } from '../services/api'

// ── tiny inline feedback banner ──────────────────────────────────────────────
function Banner({ type, message }) {
  if (!message) return null
  const isError = type === 'error'
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
      isError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
    }`}>
      {isError
        ? <AlertCircle className="w-4 h-4 flex-shrink-0" />
        : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
      {message}
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────
const LS_NOTIF_KEY = 'speechecho_notifications'

function loadFromLS(key, defaults) {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') } }
  catch { return defaults }
}

export default function Settings() {
  const { user, logout, updateUser } = useAuth()
  const { darkMode, toggleDark, language, changeLanguage, t } = useAppearance()
  const [activeTab, setActiveTab] = useState('profile')

  // ── Profile state ─────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    fullName: user?.full_name || '',
    username: user?.username || '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' })

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Sync when user object changes
  useEffect(() => {
    setProfile({ fullName: user?.full_name || '', username: user?.username || '' })
    setAvatarPreview(user?.avatar_url || null)
  }, [user])

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setProfileMsg({ type: 'error', text: 'Image must be smaller than 2 MB.' })
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setProfileMsg({ type: 'error', text: 'Only JPEG, PNG, WebP or GIF images are allowed.' })
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setProfileMsg({ type: '', text: '' })
  }

  const handleAvatarUpload = async () => {
    if (!avatarFile) return
    setAvatarUploading(true)
    setProfileMsg({ type: '', text: '' })
    try {
      const fd = new FormData()
      fd.append('file', avatarFile)
      const res = await authService.uploadAvatar(fd)
      updateUser(res.data.user)
      setAvatarFile(null)
      setProfileMsg({ type: 'success', text: 'Profile picture updated!' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to upload picture.' })
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleProfileSave = async () => {
    setProfileSaving(true)
    setProfileMsg({ type: '', text: '' })
    try {
      const res = await authService.updateProfile({
        full_name: profile.fullName.trim() || undefined,
        username:  profile.username.trim()  || undefined,
      })
      updateUser(res.data.user)
      setProfileMsg({ type: 'success', text: t('saveProfile') + ' ✓' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to update profile.' })
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Notifications state ───────────────────────────────────────────────────
  const [notif, setNotif] = useState(() =>
    loadFromLS(LS_NOTIF_KEY, { email: true, push: true, sound: true })
  )
  const [notifMsg, setNotifMsg] = useState({ type: '', text: '' })

  const handleNotifSave = () => {
    localStorage.setItem(LS_NOTIF_KEY, JSON.stringify(notif))
    setNotifMsg({ type: 'success', text: t('savePrefs') + ' ✓' })
    setTimeout(() => setNotifMsg({ type: '', text: '' }), 3000)
  }

  // ── Appearance: uses AppearanceContext directly ───────────────────────────
  const [appearMsg, setAppearMsg] = useState({ type: '', text: '' })

  const handleAppearSave = () => {
    // Context already persists on every change; this just shows confirmation
    setAppearMsg({ type: 'success', text: t('saveAppear') + ' ✓' })
    setTimeout(() => setAppearMsg({ type: '', text: '' }), 3000)
  }

  // ── Security state ────────────────────────────────────────────────────────
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' })
  const [deleting, setDeleting] = useState(false)
  const [delMsg, setDelMsg] = useState({ type: '', text: '' })
  const [showConfirm, setShowConfirm] = useState(false)

  const isGoogleUser = user?.provider === 'google' || !user?.has_password

  const handlePasswordChange = async () => {
    setPwMsg({ type: '', text: '' })
    if (!passwords.current || !passwords.next || !passwords.confirm) {
      setPwMsg({ type: 'error', text: 'Please fill in all password fields.' }); return
    }
    if (passwords.next !== passwords.confirm) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' }); return
    }
    if (passwords.next.length < 6) {
      setPwMsg({ type: 'error', text: 'New password must be at least 6 characters.' }); return
    }
    setPwSaving(true)
    try {
      await authService.changePassword({
        current_password: passwords.current,
        new_password:     passwords.next,
      })
      setPasswords({ current: '', next: '', confirm: '' })
      setPwMsg({ type: 'success', text: 'Password changed successfully.' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to change password.' })
    } finally {
      setPwSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDelMsg({ type: '', text: '' })
    try {
      await authService.deleteAccount()
      logout()
    } catch (err) {
      setDelMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to delete account.' })
      setDeleting(false)
      setShowConfirm(false)
    }
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = [
    { key: 'profile',       label: t('profile'),       icon: User   },
    { key: 'notifications', label: t('notifications'), icon: Bell   },
    { key: 'appearance',    label: t('appearance'),    icon: Moon   },
    { key: 'security',      label: t('security'),      icon: Shield },
  ]

  // ── Toggle component ──────────────────────────────────────────────────────
  const Toggle = ({ checked, onChange }) => (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
    </label>
  )

  // ── Avatar display ────────────────────────────────────────────────────────
  const avatarInitial = (user?.username || 'U')[0].toUpperCase()
  const avatarBg = 'bg-gradient-to-br from-primary-500 to-indigo-600'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('settings')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('manageAccount')}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="card">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="card">

            {/* ── PROFILE ─────────────────────────────────────────────────── */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('profileInfo')}</h2>

                <Banner type={profileMsg.type} message={profileMsg.text} />

                {/* Avatar upload area */}
                <div className="flex items-center gap-6">
                  {/* Circle */}
                  <div className="relative group">
                    <div className={`w-24 h-24 ${avatarBg} rounded-full flex items-center justify-center overflow-hidden ring-4 ring-white dark:ring-gray-700 shadow-md`}>
                      {avatarPreview
                        ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                        : <span className="text-white font-bold text-3xl">{avatarInitial}</span>
                      }
                    </div>
                    {/* Camera overlay */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Change photo"
                    >
                      <Camera className="w-7 h-7 text-white" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </div>

                  {/* Upload action */}
                  <div className="space-y-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary text-sm"
                    >
                      {avatarFile ? 'Change Photo' : 'Upload Photo'}
                    </button>
                    {avatarFile && (
                      <button
                        onClick={handleAvatarUpload}
                        disabled={avatarUploading}
                        className="btn-primary text-sm flex items-center gap-2"
                      >
                        {avatarUploading
                          ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</>
                          : <><Save className="w-4 h-4" />Save Photo</>}
                      </button>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500">JPG, PNG, WebP or GIF · Max 2 MB</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('fullName')}</label>
                    <input
                      type="text"
                      value={profile.fullName}
                      onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                      className="input-field dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('username')}</label>
                    <input
                      type="text"
                      value={profile.username}
                      onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                      className="input-field dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      placeholder="Your username"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('email')}</label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="input-field bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('emailNote')}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                    className="btn-primary flex items-center gap-2"
                  >
                    {profileSaving
                      ? <><Loader2 className="w-5 h-5 animate-spin" />Saving…</>
                      : <><Save className="w-5 h-5" />{t('saveProfile')}</>}
                  </button>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS ────────────────────────────────────────────── */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('notifPrefs')}</h2>

                <Banner type={notifMsg.type} message={notifMsg.text} />

                <div className="space-y-4">
                  {[
                    { key: 'email', label: t('emailNotif'),  desc: t('emailNotifDesc') },
                    { key: 'push',  label: t('pushNotif'),   desc: t('pushNotifDesc')  },
                    { key: 'sound', label: t('soundAlerts'), desc: t('soundAlertsDesc')},
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</p>
                      </div>
                      <Toggle
                        checked={notif[item.key]}
                        onChange={(e) => setNotif({ ...notif, [item.key]: e.target.checked })}
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={handleNotifSave} className="btn-primary flex items-center gap-2">
                    <Save className="w-5 h-5" />{t('savePrefs')}
                  </button>
                </div>
              </div>
            )}

            {/* ── APPEARANCE ───────────────────────────────────────────────── */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('appearTitle')}</h2>

                <Banner type={appearMsg.type} message={appearMsg.text} />

                {/* Dark mode */}
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {darkMode
                      ? <Moon className="w-5 h-5 text-indigo-400" />
                      : <Sun  className="w-5 h-5 text-amber-500" />}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{t('darkMode')}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('darkModeDesc')}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={darkMode}
                    onChange={(e) => toggleDark(e.target.checked)}
                  />
                </div>

                {/* Language */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      {t('language')}
                    </div>
                  </label>
                  <select
                    value={language}
                    onChange={(e) => changeLanguage(e.target.value)}
                    className="input-field dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="en">🇬🇧 English</option>
                    <option value="es">🇪🇸 Español</option>
                    <option value="fr">🇫🇷 Français</option>
                    <option value="de">🇩🇪 Deutsch</option>
                    <option value="zh">🇨🇳 中文</option>
                    <option value="ar">🇸🇦 العربية</option>
                  </select>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Changes apply instantly to this settings page.
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={handleAppearSave} className="btn-primary flex items-center gap-2">
                    <Save className="w-5 h-5" />{t('saveAppear')}
                  </button>
                </div>
              </div>
            )}

            {/* ── SECURITY ─────────────────────────────────────────────────── */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('securityTitle')}</h2>

                {/* Change Password */}
                <div className="p-5 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-4">
                  <div className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('changePassword')}</h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('changePwDesc')}</p>

                  <Banner type={pwMsg.type} message={pwMsg.text} />

                  {isGoogleUser ? (
                    <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 px-4 py-3 rounded-lg">
                      {t('googlePwNote')}
                    </p>
                  ) : (
                    <>
                      <input
                        type="password"
                        placeholder={t('currentPw')}
                        value={passwords.current}
                        onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                        className="input-field dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      />
                      <input
                        type="password"
                        placeholder={t('newPw')}
                        value={passwords.next}
                        onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
                        className="input-field dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      />
                      <input
                        type="password"
                        placeholder={t('confirmPw')}
                        value={passwords.confirm}
                        onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                        className="input-field dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      />
                      <button
                        onClick={handlePasswordChange}
                        disabled={pwSaving}
                        className="btn-primary flex items-center gap-2"
                      >
                        {pwSaving
                          ? <><Loader2 className="w-5 h-5 animate-spin" />Updating…</>
                          : <><Lock className="w-5 h-5" />{t('updatePw')}</>}
                      </button>
                    </>
                  )}
                </div>

                {/* Danger Zone */}
                <div className="p-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <h3 className="font-semibold text-red-900 dark:text-red-300">{t('dangerZone')}</h3>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400">{t('dangerDesc')}</p>

                  <Banner type={delMsg.type} message={delMsg.text} />

                  {!showConfirm ? (
                    <button
                      onClick={() => setShowConfirm(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {t('deleteAccount')}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                        {t('confirmDelete')}
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleting}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {deleting
                            ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</>
                            : t('yesDelete')}
                        </button>
                        <button
                          onClick={() => setShowConfirm(false)}
                          disabled={deleting}
                          className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
