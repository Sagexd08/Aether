'use client'

import { create } from 'zustand'

export interface SessionState {
  sessionId: string | null
  generationsRemaining: number
  status: 'loading' | 'ready' | 'error'
  createSession: () => Promise<void>
  decrementRemaining: () => void
}

const SESSION_KEY = 'aether_session_id'
const REMAINING_KEY = 'aether_generations_remaining'
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  generationsRemaining: 2,
  status: 'loading',

  async createSession() {
    const existingSessionId = typeof window !== 'undefined' ? window.localStorage.getItem(SESSION_KEY) : null
    const existingRemaining = typeof window !== 'undefined' ? window.localStorage.getItem(REMAINING_KEY) : null

    if (existingSessionId && existingRemaining) {
      set({
        sessionId: existingSessionId,
        generationsRemaining: parseInt(existingRemaining, 10),
        status: 'ready',
      })
      return
    }

    try {
      const resp = await fetch(`${API_URL}/api/session/create`, { method: 'POST' })
      if (!resp.ok) throw new Error('Failed to create session')
      const data = (await resp.json()) as { session_id: string; generation_limit_remaining: number }
      
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SESSION_KEY, data.session_id)
        window.localStorage.setItem(REMAINING_KEY, String(data.generation_limit_remaining))
      }
      
      set({
        sessionId: data.session_id,
        generationsRemaining: data.generation_limit_remaining,
        status: 'ready',
      })
    } catch (error) {
      console.error('Failed to create session:', error)
      set({ status: 'error' })
    }
  },

  decrementRemaining() {
    const { generationsRemaining } = get()
    const newRemaining = Math.max(0, generationsRemaining - 1)
    
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REMAINING_KEY, String(newRemaining))
    }
    
    set({ generationsRemaining: newRemaining })
  },
}))
