'use client'

import { create } from 'zustand'
import type { UserWithWorkspace, Workspace } from '@aether/types'
import { getMe, signOut as apiSignOut } from '@/lib/api/auth'
import { listWorkspaces } from '@/lib/api/workspaces'
import { clearToken, getToken, setToken } from '@/lib/api/client'

interface AuthState {
  user: UserWithWorkspace | null
  token: string | null
  workspace: Workspace | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  hydrate(): Promise<void>
  setAuth(token: string, user: UserWithWorkspace): void
  setWorkspace(workspace: Workspace): void
  signOut(): Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  workspace: null,
  status: 'loading',

  setAuth(token, user) {
    setToken(token)
    set({ token, user, status: 'authenticated' })
  },

  setWorkspace(workspace) {
    set({ workspace })
  },

  async hydrate() {
    const token = getToken()
    if (!token) {
      set({ status: 'unauthenticated' })
      return
    }

    try {
      const user = await getMe()
      set({ token, user, status: 'authenticated' })

      const workspaces = await listWorkspaces()
      if (workspaces.length > 0) {
        set({ workspace: workspaces[0] })
      }
    } catch {
      clearToken()
      set({ status: 'unauthenticated', user: null, token: null, workspace: null })
    }
  },

  async signOut() {
    try {
      await apiSignOut()
    } finally {
      clearToken()
      set({ status: 'unauthenticated', user: null, token: null, workspace: null })
    }
  },
}))
