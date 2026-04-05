import { createContext, useContext, useState, useEffect } from 'react'

const LS_KEY = 'speechecho_appearance'

const AppearanceContext = createContext(null)

// ── simple label dictionary ───────────────────────────────────────────────────
// Add more keys as needed. Only Settings labels are translated here; the rest
// of the UI stays in English for now (easy to extend later).
const LABELS = {
  en: {
    settings:       'Settings',
    manageAccount:  'Manage your account and preferences',
    profile:        'Profile',
    notifications:  'Notifications',
    appearance:     'Appearance',
    security:       'Security',
    profileInfo:    'Profile Information',
    fullName:       'Full Name',
    username:       'Username',
    email:          'Email Address',
    emailNote:      'Email address cannot be changed.',
    saveProfile:    'Save Profile',
    notifPrefs:     'Notification Preferences',
    emailNotif:     'Email Notifications',
    emailNotifDesc: 'Receive updates via email',
    pushNotif:      'Push Notifications',
    pushNotifDesc:  'Browser push notifications',
    soundAlerts:    'Sound Alerts',
    soundAlertsDesc:'Play sounds for notifications',
    savePrefs:      'Save Preferences',
    appearTitle:    'Appearance',
    darkMode:       'Dark Mode',
    darkModeDesc:   'Toggle dark theme',
    language:       'Language',
    saveAppear:     'Save Appearance',
    securityTitle:  'Security',
    changePassword: 'Change Password',
    changePwDesc:   'Update your password regularly for security.',
    currentPw:      'Current Password',
    newPw:          'New Password (min. 6 characters)',
    confirmPw:      'Confirm New Password',
    updatePw:       'Update Password',
    dangerZone:     'Danger Zone',
    dangerDesc:     'Deleting your account is permanent. All your data — voices, chat history, and documents — will be erased immediately.',
    deleteAccount:  'Delete Account',
    confirmDelete:  'Are you absolutely sure? This cannot be undone.',
    yesDelete:      'Yes, delete my account',
    cancel:         'Cancel',
    googlePwNote:   'Your account uses Google sign-in. Password changes are not available.',
  },
  es: {
    settings:       'Configuración',
    manageAccount:  'Administra tu cuenta y preferencias',
    profile:        'Perfil',
    notifications:  'Notificaciones',
    appearance:     'Apariencia',
    security:       'Seguridad',
    profileInfo:    'Información de Perfil',
    fullName:       'Nombre Completo',
    username:       'Usuario',
    email:          'Correo Electrónico',
    emailNote:      'El correo electrónico no se puede cambiar.',
    saveProfile:    'Guardar Perfil',
    notifPrefs:     'Preferencias de Notificación',
    emailNotif:     'Notificaciones por Correo',
    emailNotifDesc: 'Recibir actualizaciones por correo',
    pushNotif:      'Notificaciones Push',
    pushNotifDesc:  'Notificaciones push del navegador',
    soundAlerts:    'Alertas de Sonido',
    soundAlertsDesc:'Reproducir sonidos para notificaciones',
    savePrefs:      'Guardar Preferencias',
    appearTitle:    'Apariencia',
    darkMode:       'Modo Oscuro',
    darkModeDesc:   'Activar tema oscuro',
    language:       'Idioma',
    saveAppear:     'Guardar Apariencia',
    securityTitle:  'Seguridad',
    changePassword: 'Cambiar Contraseña',
    changePwDesc:   'Actualiza tu contraseña regularmente.',
    currentPw:      'Contraseña Actual',
    newPw:          'Nueva Contraseña (mín. 6 caracteres)',
    confirmPw:      'Confirmar Nueva Contraseña',
    updatePw:       'Actualizar Contraseña',
    dangerZone:     'Zona de Peligro',
    dangerDesc:     'Eliminar tu cuenta es permanente. Todos tus datos serán borrados.',
    deleteAccount:  'Eliminar Cuenta',
    confirmDelete:  '¿Estás absolutamente seguro? Esto no se puede deshacer.',
    yesDelete:      'Sí, eliminar mi cuenta',
    cancel:         'Cancelar',
    googlePwNote:   'Tu cuenta usa Google. Los cambios de contraseña no están disponibles.',
  },
  fr: {
    settings:       'Paramètres',
    manageAccount:  'Gérez votre compte et vos préférences',
    profile:        'Profil',
    notifications:  'Notifications',
    appearance:     'Apparence',
    security:       'Sécurité',
    profileInfo:    'Informations de Profil',
    fullName:       'Nom Complet',
    username:       "Nom d'utilisateur",
    email:          'Adresse Email',
    emailNote:      "L'adresse email ne peut pas être modifiée.",
    saveProfile:    'Enregistrer le Profil',
    notifPrefs:     'Préférences de Notification',
    emailNotif:     'Notifications Email',
    emailNotifDesc: 'Recevoir des mises à jour par email',
    pushNotif:      'Notifications Push',
    pushNotifDesc:  'Notifications push du navigateur',
    soundAlerts:    'Alertes Sonores',
    soundAlertsDesc:'Jouer des sons pour les notifications',
    savePrefs:      'Enregistrer les Préférences',
    appearTitle:    'Apparence',
    darkMode:       'Mode Sombre',
    darkModeDesc:   'Activer le thème sombre',
    language:       'Langue',
    saveAppear:     "Enregistrer l'Apparence",
    securityTitle:  'Sécurité',
    changePassword: 'Changer le Mot de Passe',
    changePwDesc:   'Mettez à jour votre mot de passe régulièrement.',
    currentPw:      'Mot de Passe Actuel',
    newPw:          'Nouveau Mot de Passe (min. 6 caractères)',
    confirmPw:      'Confirmer le Nouveau Mot de Passe',
    updatePw:       'Mettre à Jour le Mot de Passe',
    dangerZone:     'Zone Dangereuse',
    dangerDesc:     'La suppression de votre compte est permanente.',
    deleteAccount:  'Supprimer le Compte',
    confirmDelete:  'Êtes-vous absolument sûr ? Cela ne peut pas être annulé.',
    yesDelete:      'Oui, supprimer mon compte',
    cancel:         'Annuler',
    googlePwNote:   'Votre compte utilise Google. Les changements de mot de passe ne sont pas disponibles.',
  },
  de: {
    settings:       'Einstellungen',
    manageAccount:  'Verwalten Sie Ihr Konto und Ihre Einstellungen',
    profile:        'Profil',
    notifications:  'Benachrichtigungen',
    appearance:     'Erscheinungsbild',
    security:       'Sicherheit',
    profileInfo:    'Profilinformationen',
    fullName:       'Vollständiger Name',
    username:       'Benutzername',
    email:          'E-Mail-Adresse',
    emailNote:      'E-Mail-Adresse kann nicht geändert werden.',
    saveProfile:    'Profil Speichern',
    notifPrefs:     'Benachrichtigungseinstellungen',
    emailNotif:     'E-Mail-Benachrichtigungen',
    emailNotifDesc: 'Updates per E-Mail erhalten',
    pushNotif:      'Push-Benachrichtigungen',
    pushNotifDesc:  'Browser-Push-Benachrichtigungen',
    soundAlerts:    'Tonalarme',
    soundAlertsDesc:'Töne für Benachrichtigungen abspielen',
    savePrefs:      'Einstellungen Speichern',
    appearTitle:    'Erscheinungsbild',
    darkMode:       'Dunkelmodus',
    darkModeDesc:   'Dunkles Design aktivieren',
    language:       'Sprache',
    saveAppear:     'Erscheinungsbild Speichern',
    securityTitle:  'Sicherheit',
    changePassword: 'Passwort Ändern',
    changePwDesc:   'Aktualisieren Sie Ihr Passwort regelmäßig.',
    currentPw:      'Aktuelles Passwort',
    newPw:          'Neues Passwort (min. 6 Zeichen)',
    confirmPw:      'Neues Passwort Bestätigen',
    updatePw:       'Passwort Aktualisieren',
    dangerZone:     'Gefahrenzone',
    dangerDesc:     'Das Löschen Ihres Kontos ist dauerhaft.',
    deleteAccount:  'Konto Löschen',
    confirmDelete:  'Sind Sie absolut sicher? Dies kann nicht rückgängig gemacht werden.',
    yesDelete:      'Ja, mein Konto löschen',
    cancel:         'Abbrechen',
    googlePwNote:   'Ihr Konto verwendet Google. Passwortänderungen sind nicht verfügbar.',
  },
  zh: {
    settings:       '设置',
    manageAccount:  '管理您的账号和偏好',
    profile:        '个人资料',
    notifications:  '通知',
    appearance:     '外观',
    security:       '安全',
    profileInfo:    '个人信息',
    fullName:       '全名',
    username:       '用户名',
    email:          '电子邮件地址',
    emailNote:      '电子邮件地址无法更改。',
    saveProfile:    '保存资料',
    notifPrefs:     '通知偏好',
    emailNotif:     '电子邮件通知',
    emailNotifDesc: '通过电子邮件接收更新',
    pushNotif:      '推送通知',
    pushNotifDesc:  '浏览器推送通知',
    soundAlerts:    '声音提醒',
    soundAlertsDesc:'为通知播放声音',
    savePrefs:      '保存偏好',
    appearTitle:    '外观',
    darkMode:       '深色模式',
    darkModeDesc:   '切换深色主题',
    language:       '语言',
    saveAppear:     '保存外观',
    securityTitle:  '安全',
    changePassword: '修改密码',
    changePwDesc:   '定期更新您的密码以确保安全。',
    currentPw:      '当前密码',
    newPw:          '新密码（至少6个字符）',
    confirmPw:      '确认新密码',
    updatePw:       '更新密码',
    dangerZone:     '危险区域',
    dangerDesc:     '删除账户是永久性的，所有数据将被立即删除。',
    deleteAccount:  '删除账户',
    confirmDelete:  '您确定吗？此操作无法撤销。',
    yesDelete:      '是的，删除我的账户',
    cancel:         '取消',
    googlePwNote:   '您的账户使用谷歌登录，无法修改密码。',
  },
  ar: {
    settings:       'الإعدادات',
    manageAccount:  'إدارة حسابك وتفضيلاتك',
    profile:        'الملف الشخصي',
    notifications:  'الإشعارات',
    appearance:     'المظهر',
    security:       'الأمان',
    profileInfo:    'معلومات الملف الشخصي',
    fullName:       'الاسم الكامل',
    username:       'اسم المستخدم',
    email:          'عنوان البريد الإلكتروني',
    emailNote:      'لا يمكن تغيير عنوان البريد الإلكتروني.',
    saveProfile:    'حفظ الملف الشخصي',
    notifPrefs:     'تفضيلات الإشعارات',
    emailNotif:     'إشعارات البريد الإلكتروني',
    emailNotifDesc: 'تلقي التحديثات عبر البريد الإلكتروني',
    pushNotif:      'إشعارات الدفع',
    pushNotifDesc:  'إشعارات دفع المتصفح',
    soundAlerts:    'تنبيهات صوتية',
    soundAlertsDesc:'تشغيل أصوات للإشعارات',
    savePrefs:      'حفظ التفضيلات',
    appearTitle:    'المظهر',
    darkMode:       'الوضع الداكن',
    darkModeDesc:   'تفعيل الثيم الداكن',
    language:       'اللغة',
    saveAppear:     'حفظ المظهر',
    securityTitle:  'الأمان',
    changePassword: 'تغيير كلمة المرور',
    changePwDesc:   'قم بتحديث كلمة مرورك بانتظام.',
    currentPw:      'كلمة المرور الحالية',
    newPw:          'كلمة المرور الجديدة (6 أحرف على الأقل)',
    confirmPw:      'تأكيد كلمة المرور الجديدة',
    updatePw:       'تحديث كلمة المرور',
    dangerZone:     'منطقة الخطر',
    dangerDesc:     'حذف حسابك نهائي. ستُمحى جميع بياناتك فوراً.',
    deleteAccount:  'حذف الحساب',
    confirmDelete:  'هل أنت متأكد تماماً؟ لا يمكن التراجع.',
    yesDelete:      'نعم، احذف حسابي',
    cancel:         'إلغاء',
    googlePwNote:   'حسابك يستخدم Google. تغيير كلمة المرور غير متاح.',
  },
}

export function AppearanceProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '{}').darkMode ?? false
    } catch { return false }
  })

  const [language, setLanguage] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '{}').language ?? 'en'
    } catch { return 'en' }
  })

  // Apply dark class whenever darkMode changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // Apply html lang attribute whenever language changes
  useEffect(() => {
    document.documentElement.setAttribute('lang', language)
    // RTL support for Arabic
    document.documentElement.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr')
  }, [language])

  const save = (newDark, newLang) => {
    localStorage.setItem(LS_KEY, JSON.stringify({ darkMode: newDark, language: newLang }))
  }

  const toggleDark = (val) => {
    setDarkMode(val)
    save(val, language)
  }

  const changeLanguage = (lang) => {
    setLanguage(lang)
    save(darkMode, lang)
  }

  const t = (key) => LABELS[language]?.[key] ?? LABELS['en'][key] ?? key

  return (
    <AppearanceContext.Provider value={{ darkMode, toggleDark, language, changeLanguage, t }}>
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext)
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider')
  return ctx
}
