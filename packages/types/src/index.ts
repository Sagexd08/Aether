export type GenerationMode = 'text' | 'image' | 'video' | 'audio'

export type GenerationStatus =
  | 'queued'
  | 'preprocessing'
  | 'running'
  | 'postprocessing'
  | 'persisting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  creditsRemaining: number
  creditsReserved: number
  createdAt: string
}

export interface GenerationJob {
  id: string
  userId: string
  workspaceId: string
  projectId: string | null
  mode: GenerationMode
  prompt: string
  negativePrompt: string | null
  model: string
  provider: string
  seed: number | null
  status: GenerationStatus
  progress: number
  errorMessage: string | null
  lastErrorCode: string | null
  retryCount: number
  cancelRequested: boolean
  creditsCosted: number | null
  idempotencyKey: string | null
  inputAssetIds: string[] | null
  metadata: Record<string, unknown>
  visibility: 'private' | 'unlisted' | 'public'
  previewStorageKey: string | null
  sourceGenerationJobId: string | null
  queueWaitMs: number | null
  inferenceDurationMs: number | null
  persistDurationMs: number | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assets: Asset[]
}

export interface Asset {
  id: string
  generationJobId: string
  userId: string
  workspaceId: string
  generationIndex: number
  type: 'image' | 'video' | 'audio'
  storageKey: string
  mimeType: string
  fileSizeBytes: number | null
  width: number | null
  height: number | null
  durationSeconds: number | null
  metadata: Record<string, unknown>
  isFavorite: boolean
  visibility: 'private' | 'unlisted' | 'public'
  status: 'pending' | 'ready' | 'failed'
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
  | {
      type: 'generation.progress'
      jobId: string
      workspaceId: string
      ts: number
      payload: { status: GenerationStatus; progress: number }
    }
  | {
      type: 'generation.completed'
      jobId: string
      workspaceId: string
      ts: number
      payload: { job: GenerationJob; assets: Asset[] }
    }
  | {
      type: 'generation.failed'
      jobId: string
      workspaceId: string
      ts: number
      payload: { error: string; errorCode: string | null }
    }
  | { type: 'training.progress'; jobId: string; progress: number; workerStatus: string; ts: number }
  | { type: 'training.completed'; jobId: string; artifactPaths: Record<string, string>; ts: number }
  | { type: 'notification'; id: string; title: string; body: string; kind: string; ts: number }

// Client → Server WebSocket messages
export type WSClientMessage =
  | { type: 'ping'; ts: number }
