export type GenerationMode = 'text' | 'image' | 'video' | 'audio'
export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  creditsRemaining: number
  createdAt: string
}

export interface Generation {
  id: string
  userId: string
  mode: GenerationMode
  status: GenerationStatus
  prompt: string
  enhancedPrompt?: string | null
  modelUsed?: string | null
  outputUrl?: string | null
  outputText?: string | null
  creditsUsed: number
  createdAt: string
}

export interface NotificationItem {
  id: string
  title: string
  body: string
  level: 'info' | 'success' | 'warning' | 'error'
  createdAt: string
  read: boolean
}

export interface AuthResponse {
  accessToken: string
  user: User
}
