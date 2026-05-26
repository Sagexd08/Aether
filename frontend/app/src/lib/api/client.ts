const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'aether_token'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { sessionId?: string } = {},
): Promise<T> {
  const requestId = crypto.randomUUID()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('X-Request-ID', requestId)
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (init.sessionId) {
    headers.set('X-Session-Id', init.sessionId)
  }

  const resp = await fetch(`${API_URL}${path}`, { ...init, headers })

  if (!resp.ok) {
    let detail: unknown
    let message: string
    try {
      detail = await resp.json()
      message = (detail as { detail?: string }).detail ?? `Request failed: ${resp.status}`
    } catch {
      message = `Request failed: ${resp.status}`
    }
    throw new ApiError(resp.status, message, detail)
  }

  return resp.json() as Promise<T>
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
}
