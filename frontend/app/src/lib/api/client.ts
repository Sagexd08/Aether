import { toast } from '@/components/ui/toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let refreshPromise: Promise<string> | null = null

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('aether_token')
}

export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('aether_token', token)
  }
}

export function clearToken(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('aether_token')
  }
}

async function silentRefresh(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const resp = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!resp.ok) throw new ApiError(resp.status, 'Refresh failed')
    const data = (await resp.json()) as { access_token: string }
    setToken(data.access_token)
    return data.access_token
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestId = crypto.randomUUID()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('X-Request-ID', requestId)

  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const resp = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' })

  if (resp.status === 401) {
    let newToken: string
    try {
      newToken = await silentRefresh()
    } catch {
      clearToken()
      if (typeof window !== 'undefined') {
        toast.error('Session expired — please sign in again')
        window.location.href = '/signin?expired=1'
      }
      throw new ApiError(401, 'Session expired')
    }

    const retryHeaders = new Headers(init.headers)
    retryHeaders.set('Content-Type', 'application/json')
    retryHeaders.set('X-Request-ID', requestId)
    retryHeaders.set('Authorization', `Bearer ${newToken}`)
    const retryResp = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: retryHeaders,
      credentials: 'include',
    })

    if (!retryResp.ok) {
      clearToken()
      if (typeof window !== 'undefined') {
        toast.error('Session expired — please sign in again')
        window.location.href = '/signin?expired=1'
      }
      throw new ApiError(retryResp.status, 'Authentication failed')
    }

    return retryResp.json() as Promise<T>
  }

  if (!resp.ok) {
    let message: string
    try {
      const body = (await resp.json()) as { detail?: string }
      message = body.detail ?? `Request failed: ${resp.status}`
    } catch {
      message = `Request failed: ${resp.status}`
    }
    throw new ApiError(resp.status, message)
  }

  return resp.json() as Promise<T>
}
