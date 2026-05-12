'use client'

import { create } from 'zustand'
import type { GenerationJob, GenerationStatus, Asset } from '@aether/types'

export interface ActiveGenerationState {
  jobId: string
  mode: string
  prompt: string
  status: GenerationStatus
  progress: number
  errorMessage: string | null
  assets: Asset[]
  createdAt: number  // timestamp for sorting
}

interface GenerationStore {
  activeJobs: Record<string, ActiveGenerationState>
  focusedJobId: string | undefined

  setActiveJob(job: ActiveGenerationState): void
  updateProgress(jobId: string, status: GenerationStatus, progress: number): void
  completeJob(jobId: string, assets: Asset[]): void
  failJob(jobId: string, error: string): void
  cancelJob(jobId: string): void
  hydrateFromServer(jobs: GenerationJob[]): void
  setFocusedJob(jobId: string): void
  clearCompleted(): void
}

const FOCUSED_KEY = 'aether_focused_job'

function loadFocusedId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return sessionStorage.getItem(FOCUSED_KEY) ?? undefined
}

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  activeJobs: {},
  focusedJobId: loadFocusedId(),

  setActiveJob(job) {
    set((s) => ({
      activeJobs: { ...s.activeJobs, [job.jobId]: job },
      focusedJobId: job.jobId,
    }))
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(FOCUSED_KEY, job.jobId)
    }
  },

  updateProgress(jobId, status, progress) {
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status, progress },
        },
      }
    })
  },

  completeJob(jobId, assets) {
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status: 'completed', progress: 100, assets },
        },
      }
    })
  },

  failJob(jobId, error) {
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status: 'failed', errorMessage: error },
        },
      }
    })
  },

  cancelJob(jobId) {
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status: 'cancelled' },
        },
      }
    })
  },

  hydrateFromServer(jobs) {
    const incoming: Record<string, ActiveGenerationState> = {}
    for (const job of jobs) {
      incoming[job.id] = {
        jobId: job.id,
        mode: job.mode,
        prompt: job.prompt,
        status: job.status,
        progress: job.progress,
        errorMessage: job.errorMessage,
        assets: job.assets,
        createdAt: new Date(job.createdAt).getTime(),
      }
    }
    set((s) => ({
      activeJobs: { ...s.activeJobs, ...incoming },
    }))
  },

  setFocusedJob(jobId) {
    set({ focusedJobId: jobId })
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(FOCUSED_KEY, jobId)
    }
  },

  clearCompleted() {
    set((s) => {
      const next: Record<string, ActiveGenerationState> = {}
      for (const [id, job] of Object.entries(s.activeJobs)) {
        if (job.status !== 'completed' && job.status !== 'cancelled') {
          next[id] = job
        }
      }
      return { activeJobs: next }
    })
  },
}))
