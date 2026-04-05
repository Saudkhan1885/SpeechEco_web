import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AudioWaveform, Eye, EyeOff, Loader2, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { authService } from '../../services/api'

export default function Register() {
  const navigate = useNavigate()
  const { register, googleLogin } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [googleClientId, setGoogleClientId] = useState('')

  // Load Google Sign-In script and get client ID
  useEffect(() => {
    const loadGoogleScript = async () => {
      try {
        // Get Google Client ID from backend
        const response = await authService.getGoogleClientId()
        const clientId = response.data.client_id
        setGoogleClientId(clientId)

        // Load Google Identity Services script
        if (!document.getElementById('google-signin-script')) {
          const script = document.createElement('script')
          script.id = 'google-signin-script'
          script.src = 'https://accounts.google.com/gsi/client'
          script.async = true
          script.defer = true
          script.onload = () => initializeGoogleSignIn(clientId)
          document.body.appendChild(script)
        } else if (window.google) {
          initializeGoogleSignIn(clientId)
        }
      } catch (err) {
        console.log('Google OAuth not configured:', err)
      }
    }

    loadGoogleScript()
  }, [])

  const initializeGoogleSignIn = (clientId) => {
    if (window.google && clientId) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCallback,
      })
      
      window.google.accounts.id.renderButton(
        document.getElementById('google-signup-button'),
        { 
          theme: 'outline', 
          size: 'large', 
          width: '100%',
          text: 'signup_with',
          shape: 'rectangular'
        }
      )
    }
  }

  const handleGoogleCallback = async (response) => {
    setIsGoogleLoading(true)
    setError('')
    
    const result = await googleLogin(response.credential)
    
    if (result.success) {
      navigate('/dashboard')
    } else {
      setError(result.error)
    }
    
    setIsGoogleLoading(false)
  }

  const passwordRequirements = [
    { label: 'At least 8 characters', met: formData.password.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(formData.password) },
    { label: 'Contains a letter', met: /[a-zA-Z]/.test(formData.password) },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!passwordRequirements.every(req => req.met)) {
      setError('Password does not meet requirements')
      return
    }

    setIsLoading(true)

    const result = await register(
      formData.email,
      formData.username,
      formData.password,
      formData.fullName || null
    )
    
    if (result.success) {
      navigate('/dashboard')
    } else {
      setError(result.error)
    }
    
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <AudioWaveform className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">SpeechEcho</h1>
          <p className="text-gray-500 mt-2">Real-Time Voice Cloning System</p>
        </div>

        {/* Register Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Create account</h2>
          <p className="text-gray-500 mb-6">Get started with SpeechEcho today</p>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name (Optional)
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="input-field"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="input-field"
                placeholder="Choose a username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input-field pr-12"
                  placeholder="Create a strong password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Password requirements */}
              <div className="mt-3 space-y-1">
                {passwordRequirements.map((req, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      req.met ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Check className={`w-3 h-3 ${req.met ? 'text-green-600' : 'text-gray-300'}`} />
                    </div>
                    <span className={`text-xs ${req.met ? 'text-green-600' : 'text-gray-400'}`}>
                      {req.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="input-field"
                placeholder="Confirm your password"
                required
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            <div className="flex items-start gap-2 pt-2">
              <input
                type="checkbox"
                id="terms"
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 mt-0.5"
                required
              />
              <label htmlFor="terms" className="text-sm text-gray-600">
                I agree to the{' '}
                <a href="#" className="text-primary-600 hover:text-primary-700">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-primary-600 hover:text-primary-700">Privacy Policy</a>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3 mt-6"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">Or sign up with</span>
            </div>
          </div>

          {/* Google Sign-Up Button */}
          <div className="flex justify-center">
            {isGoogleLoading ? (
              <div className="flex items-center justify-center gap-2 py-3 px-4 border border-gray-300 rounded-lg w-full">
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                <span className="text-gray-600">Signing up with Google...</span>
              </div>
            ) : (
              <div id="google-signup-button" className="w-full flex justify-center"></div>
            )}
          </div>

          {!googleClientId && (
            <p className="text-xs text-gray-400 text-center mt-3">
              Google Sign-Up not configured
            </p>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
