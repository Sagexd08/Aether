'use client'

import { create } from 'zustand'
import type { GenerationMode, NotificationItem } from '@aether/types'

interface AppShellState {
  activeMode: GenerationMode
  notifications: NotificationItem[]
  navCollapsed: boolean
  setActiveMode: (mode: GenerationMode) => void
  toggleNav: () => void
  setNotifications: (items: NotificationItem[]) => void
}

export const useAppShellStore = create<AppShellState>((set) => ({
  activeMode: 'text',
  notifications: [],
  navCollapsed: false,
  setActiveMode: (mode) => set({ activeMode: mode }),
  toggleNav: () => set((state) => ({ navCollapsed: !state.navCollapsed })),
  setNotifications: (items) => set({ notifications: items }),
}))
