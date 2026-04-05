import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { VoiceProvider } from './contexts/VoiceContext'
import { ChatProvider } from './contexts/ChatContext'
import { AppearanceProvider } from './contexts/AppearanceContext'
import ProtectedRoute from './components/common/ProtectedRoute'
import Layout from './components/layout/Layout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import VoiceStudio from './pages/VoiceStudio'
import VoiceCloning from './pages/VoiceCloning'
import DocumentVoiceover from './pages/DocumentVoiceover'
import Chat from './pages/Chat'
import History from './pages/History'
import Settings from './pages/Settings'

function App() {
  return (
    <Router>
      <AppearanceProvider>
        <AuthProvider>
          <VoiceProvider>
            <ChatProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                
                {/* Protected routes */}
                <Route path="/" element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="voice-studio" element={<VoiceStudio />} />
                  <Route path="voice-cloning" element={<VoiceCloning />} />
                  <Route path="document-voiceover" element={<DocumentVoiceover />} />
                  <Route path="chat" element={<Chat />} />
                  {/* Redirect old voice-chat route to unified chat */}
                  <Route path="voice-chat" element={<Navigate to="/chat" replace />} />
                  <Route path="history" element={<History />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                
                {/* Fallback */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </ChatProvider>
          </VoiceProvider>
        </AuthProvider>
      </AppearanceProvider>
    </Router>
  )
}

export default App
