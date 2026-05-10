'use client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export type Dataset = {
  id: string
  workspace_id: string
  source: 'huggingface' | 'kaggle' | 'local'
  source_ref: string
  name: string
  status: string
  row_count: number
  media_types: string[]
  columns: { name: string; dtype: string; nullable?: boolean }[]
  quality_report: Record<string, unknown>
  lineage: Record<string, unknown>
  preview_samples: Record<string, unknown>[]
  created_at: string
  updated_at: string
}

export type TrainingJob = {
  id: string
  workspace_id: string
  dataset_id: string
  status: string
  task_type: string
  base_model: string
  adapter_method: string
  progress: number
  worker_status: string
  metrics: Record<string, unknown>
  artifact_paths: Record<string, string>
  checkpoint_versions: Record<string, unknown>[]
  error: string | null
  created_at: string
  updated_at: string
}

export type RegistryModel = {
  id: string
  name: string
  version: string
  base_model: string
  artifact_uri: string
  artifact_format: string
  metrics: Record<string, unknown>
  deployment_status: string
  created_at: string
}

export function getToken() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('aether_token')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  listDatasets: () => request<Dataset[]>('/api/datasets'),
  importDataset: (payload: { source: Dataset['source']; source_ref: string; name?: string }) =>
    request<Dataset>('/api/datasets/import', { method: 'POST', body: JSON.stringify(payload) }),
  listTrainingJobs: () => request<TrainingJob[]>('/api/training/jobs'),
  createTrainingJob: (payload: { dataset_id: string; task_type: string; base_model: string; adapter_method: string }) =>
    request<TrainingJob>('/api/training/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  completeTrainingJob: (jobId: string) => request<RegistryModel>(`/api/training/jobs/${jobId}/complete`, { method: 'POST' }),
  listModels: () => request<RegistryModel[]>('/api/models'),
  promoteModel: (modelId: string) => request<RegistryModel>(`/api/models/${modelId}/promote`, { method: 'POST' }),
  rollbackModel: (modelId: string) => request<RegistryModel>(`/api/models/${modelId}/rollback`, { method: 'POST' }),
}
