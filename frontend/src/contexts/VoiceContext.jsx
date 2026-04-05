import { createContext, useContext, useState, useEffect } from 'react'
import { voiceService } from '../services/api'
import { useAuth } from './AuthContext'

const VoiceContext = createContext(null)

// Default predefined voices (for local/mock mode)
const defaultPredefinedVoices = [
  { id: 1, name: 'Default Male', pitch_shift: 0.9, speed_rate: 1.0, volume: 1.0, is_predefined: true },
  { id: 2, name: 'Default Female', pitch_shift: 1.2, speed_rate: 1.0, volume: 1.0, is_predefined: true },
  { id: 3, name: 'Deep Voice', pitch_shift: 0.7, speed_rate: 0.9, volume: 1.0, is_predefined: true },
  { id: 4, name: 'High Voice', pitch_shift: 1.4, speed_rate: 1.1, volume: 1.0, is_predefined: true },
  { id: 5, name: 'Fast Reader', pitch_shift: 1.0, speed_rate: 1.3, volume: 1.0, is_predefined: true },
  { id: 6, name: 'Slow & Clear', pitch_shift: 1.0, speed_rate: 0.8, volume: 1.0, is_predefined: true },
]

export function VoiceProvider({ children }) {
  const { token } = useAuth()
  const [voices, setVoices] = useState([])
  const [clonedVoices, setClonedVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState(null)  // null = Chatterbox Default
  const [isLoading, setIsLoading] = useState(false)

  // Persist selected voice to localStorage whenever it changes
  const updateSelectedVoice = (voice) => {
    setSelectedVoice(voice)
    if (voice) {
      localStorage.setItem('defaultVoiceId', String(voice.id))
    } else {
      localStorage.removeItem('defaultVoiceId')
    }
  }

  // Load voices on mount - restore saved default voice
  useEffect(() => {
    loadVoices()
  }, [token])

  const loadVoices = async () => {
    setIsLoading(true)
    let allVoices = []
    try {
      if (token) {
        const response = await voiceService.getVoices()
        allVoices = response.data
        setVoices(allVoices.filter(v => v.is_predefined))
        setClonedVoices(allVoices.filter(v => !v.is_predefined))
      } else {
        // Use mock data
        allVoices = defaultPredefinedVoices
        setVoices(defaultPredefinedVoices)
        const storedCloned = localStorage.getItem('clonedVoices')
        if (storedCloned) {
          const parsed = JSON.parse(storedCloned)
          setClonedVoices(parsed)
          allVoices = [...allVoices, ...parsed]
        }
      }
    } catch (error) {
      console.error('Error loading voices:', error)
      // Fallback to local storage
      allVoices = defaultPredefinedVoices
      setVoices(defaultPredefinedVoices)
      const storedCloned = localStorage.getItem('clonedVoices')
      if (storedCloned) {
        const parsed = JSON.parse(storedCloned)
        setClonedVoices(parsed)
        allVoices = [...allVoices, ...parsed]
      }
    }

    // Restore saved default voice
    const savedVoiceId = localStorage.getItem('defaultVoiceId')
    if (savedVoiceId) {
      const found = allVoices.find(v => String(v.id) === savedVoiceId)
      if (found) {
        setSelectedVoice(found)
      } else {
        setSelectedVoice(null)
      }
    }

    setIsLoading(false)
  }

  const cloneVoice = async (name, description, audioFile) => {
    setIsLoading(true)
    try {
      if (token) {
        const response = await voiceService.cloneVoice(name, description, audioFile)
        const newVoice = response.data
        setClonedVoices(prev => [...prev, newVoice])
        return { success: true, voice: newVoice }
      } else {
        // Mock cloning - generate random parameters
        const newVoice = {
          id: Date.now(),
          name,
          description,
          pitch_shift: parseFloat((Math.random() * 1.5 + 0.5).toFixed(2)),
          speed_rate: parseFloat((Math.random() * 0.5 + 0.8).toFixed(2)),
          volume: 1.0,
          is_predefined: false,
          created_at: new Date().toISOString()
        }
        
        const updatedCloned = [...clonedVoices, newVoice]
        setClonedVoices(updatedCloned)
        localStorage.setItem('clonedVoices', JSON.stringify(updatedCloned))
        
        return { success: true, voice: newVoice }
      }
    } catch (error) {
      console.error('Error cloning voice:', error)
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Voice cloning failed' 
      }
    } finally {
      setIsLoading(false)
    }
  }

  const deleteVoice = async (voiceId) => {
    try {
      if (token) {
        await voiceService.deleteVoice(voiceId)
      }
      
      const updatedCloned = clonedVoices.filter(v => v.id !== voiceId)
      setClonedVoices(updatedCloned)
      localStorage.setItem('clonedVoices', JSON.stringify(updatedCloned))
      
      if (selectedVoice?.id === voiceId) {
        setSelectedVoice(null)
      }
      
      return { success: true }
    } catch (error) {
      console.error('Error deleting voice:', error)
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Delete failed' 
      }
    }
  }

  const getAllVoices = () => [...voices, ...clonedVoices]

  const getVoiceById = (id) => getAllVoices().find(v => v.id === id)

  const value = {
    voices,
    clonedVoices,
    selectedVoice,
    isLoading,
    setSelectedVoice: updateSelectedVoice,
    loadVoices,
    cloneVoice,
    deleteVoice,
    getAllVoices,
    getVoiceById
  }

  return (
    <VoiceContext.Provider value={value}>
      {children}
    </VoiceContext.Provider>
  )
}

export function useVoice() {
  const context = useContext(VoiceContext)
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider')
  }
  return context
}
