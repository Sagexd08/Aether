import type { UserWithWorkspace } from '@aether/types'
import { apiRequest, clearToken, setToken } from './client'

export interface SignUpPayload {
  email: string
  name: string
  password: string
}

export interface SignInPayload {
  email: string
  password: string
}

interface RawAuthResponse {
  access_token: string
  user: {
    id: string
    email: string
    name: string
    credits_remaining: number
    role: string
    workspace_id: string | null
  }
}

export async function signUp(payload: SignUpPayload): Promise<{ token: string; user: UserWithWorkspace }> {
  const data = await apiRequest<RawAuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setToken(data.access_token)
  return {
    token: data.access_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      creditsRemaining: data.user.credits_remaining,
      createdAt: new Date().toISOString(),
      workspaceId: data.user.workspace_id ?? '',
    },
  }
}

export async function signIn(payload: SignInPayload): Promise<{ token: string; user: UserWithWorkspace }> {
  const data = await apiRequest<RawAuthResponse>('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setToken(data.access_token)
  return {
    token: data.access_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      creditsRemaining: data.user.credits_remaining,
      createdAt: new Date().toISOString(),
      workspaceId: data.user.workspace_id ?? '',
    },
  }
}

export async function getMe(): Promise<UserWithWorkspace> {
  const data = await apiRequest<RawAuthResponse['user']>('/api/auth/me')
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    creditsRemaining: data.credits_remaining,
    createdAt: new Date().toISOString(),
    workspaceId: data.workspace_id ?? '',
  }
}

export async function signOut(): Promise<void> {
  try {
    await apiRequest('/api/auth/signout', { method: 'POST' })
  } finally {
    clearToken()
  }
}
