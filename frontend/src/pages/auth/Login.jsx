import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AudioWaveform, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { authService } from '../../services/api'

export default function Login() {
  const navigate = useNavigate()
  const { login, googleLogin } = useAuth()
  const [formData, setFormData] = useState({ username: '', password: '' })
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
        document.getElementById('google-signin-button'),
        { 
          theme: 'outline', 
          size: 'large', 
          width: '100%',
          text: 'signin_with',
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const result = await login(formData.username, formData.password)
    
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

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h2>
          <p className="text-gray-500 mb-6">Sign in to your account to continue</p>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="input-field"
                placeholder="Enter your username"
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
                  placeholder="Enter your password"
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
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Google Sign-In Button */}
          <div className="flex justify-center">
            {isGoogleLoading ? (
              <div className="flex items-center justify-center gap-2 py-3 px-4 border border-gray-300 rounded-lg w-full">
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                <span className="text-gray-600">Signing in with Google...</span>
              </div>
            ) : (
              <div id="google-signin-button" className="w-full flex justify-center"></div>
            )}
          </div>

          {!googleClientId && (
            <p className="text-xs text-gray-400 text-center mt-3">
              Google Sign-In not configured
            </p>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-500">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                Sign up
              </Link>
            </p>
          </div>
        </div>

        {/* Demo credentials */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            Demo: Create a new account or sign in with Google
          </p>
        </div>
      </div>
    </div>
  )
}
