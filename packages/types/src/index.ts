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

export interface Workspace {
  id: string
  name: string
  plan: 'studio' | 'pro' | 'enterprise'
  createdAt: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  description: string | null
  mode: 'multimodal' | 'text' | 'image' | 'video'
  createdAt: string
}

export interface WorkspaceDetail extends Workspace {
  projects: Project[]
}

export interface UserWithWorkspace extends User {
  workspaceId: string
}

// Server → Client WebSocket events
export type WSMessage =
  | { type: 'connected'; workspaceId: string; userId: string; ts: number }
  | { type: 'error'; code: string; message: string; ts: number }
  | { type: 'pong'; ts: number }
  | { type: 'workspace.presence'; userIds: string[]; ts: number }
  | { type: 'generation.queued'; generationId: string; ts: number }
  | { type: 'generation.progress'; generationId: string; progress: number; ts: number }
  | { type: 'generation.completed'; generationId: string; outputUrl?: string; ts: number }
  | { type: 'generation.failed'; generationId: string; error: string; ts: number }
  | { type: 'training.progress'; jobId: string; progress: number; workerStatus: string; ts: number }
  | { type: 'training.completed'; jobId: string; artifactPaths: Record<string, string>; ts: number }
  | { type: 'notification'; id: string; title: string; body: string; kind: string; ts: number }

// Client → Server WebSocket messages
export type WSClientMessage =
  | { type: 'ping'; ts: number }
