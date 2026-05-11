import type { Project, Workspace } from '@aether/types'
import { apiRequest } from './client'

interface RawWorkspace {
  id: string
  name: string
  plan: string
}

interface RawProject {
  id: string
  workspace_id: string
  name: string
  description: string | null
  mode: string
  created_at: string
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const data = await apiRequest<RawWorkspace[]>('/api/workspaces')
  return data.map((w) => ({
    id: w.id,
    name: w.name,
    plan: (w.plan as Workspace['plan']) ?? 'studio',
    createdAt: new Date().toISOString(),
  }))
}

export interface CreateProjectPayload {
  name: string
  description?: string
  mode?: Project['mode']
}

export async function listProjects(workspaceId: string): Promise<Project[]> {
  const data = await apiRequest<RawProject[]>(`/api/workspaces/${workspaceId}/projects`)
  return data.map((p) => ({
    id: p.id,
    workspaceId: p.workspace_id,
    name: p.name,
    description: p.description,
    mode: (p.mode as Project['mode']) ?? 'multimodal',
    createdAt: p.created_at,
  }))
}

export async function createProject(workspaceId: string, payload: CreateProjectPayload): Promise<Project> {
  const data = await apiRequest<RawProject>(`/api/workspaces/${workspaceId}/projects`, {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      description: payload.description ?? null,
      mode: payload.mode ?? 'multimodal',
    }),
  })
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    name: data.name,
    description: data.description,
    mode: (data.mode as Project['mode']) ?? 'multimodal',
    createdAt: data.created_at,
  }
}
