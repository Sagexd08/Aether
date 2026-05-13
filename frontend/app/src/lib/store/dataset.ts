'use client'

import { create } from 'zustand'
import type { Dataset, DatasetStatus } from '@aether/types'

export interface ActiveIngestionState {
  datasetId: string
  sourceRef: string
  name: string
  status: DatasetStatus
  progress: number
  errorMessage: string | null
  createdAt: number
}

interface DatasetStore {
  activeIngestions: Record<string, ActiveIngestionState>

  setIngesting(state: ActiveIngestionState): void
  updateProgress(datasetId: string, status: DatasetStatus, progress: number): void
  completeIngestion(datasetId: string): void
  failIngestion(datasetId: string, error: string): void
  hydrateFromServer(datasets: Dataset[]): void
}

export const useDatasetStore = create<DatasetStore>((set) => ({
  activeIngestions: {},

  setIngesting(state) {
    set((s) => ({
      activeIngestions: { ...s.activeIngestions, [state.datasetId]: state },
    }))
  },

  updateProgress(datasetId, status, progress) {
    set((s) => {
      const existing = s.activeIngestions[datasetId]
      if (!existing) return s
      return {
        activeIngestions: {
          ...s.activeIngestions,
          [datasetId]: { ...existing, status, progress },
        },
      }
    })
  },

  completeIngestion(datasetId) {
    set((s) => {
      const existing = s.activeIngestions[datasetId]
      if (!existing) return s
      return {
        activeIngestions: {
          ...s.activeIngestions,
          [datasetId]: { ...existing, status: 'completed', progress: 100 },
        },
      }
    })
  },

  failIngestion(datasetId, error) {
    set((s) => {
      const existing = s.activeIngestions[datasetId]
      if (!existing) return s
      return {
        activeIngestions: {
          ...s.activeIngestions,
          [datasetId]: { ...existing, status: 'failed', errorMessage: error },
        },
      }
    })
  },

  hydrateFromServer(datasets) {
    const incoming: Record<string, ActiveIngestionState> = {}
    for (const d of datasets) {
      incoming[d.id] = {
        datasetId: d.id,
        sourceRef: d.sourceRef,
        name: d.name,
        status: d.status,
        progress: d.progress,
        errorMessage: d.errorMessage,
        createdAt: new Date(d.createdAt).getTime(),
      }
    }
    set((s) => ({ activeIngestions: { ...s.activeIngestions, ...incoming } }))
  },
}))
