import type { GenerationJob, Asset } from '@aether/types'
import { apiRequest } from './client'

export interface ImageGenerateRequest {
  prompt: string
  negativePrompt?: string
  model?: string
  seed?: number
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export interface AsyncGenerateRequest {
  prompt: string
  negativePrompt?: string
  model?: string
  seed?: number
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export interface ImageGenerateResponse {
  job: GenerationJob
  asset: Asset
}

export interface AsyncGenerateResponse {
  job_id: string
  status: string
}

export interface JobsPage {
  jobs: GenerationJob[]
  next_cursor: string | null
}

function toSnake(req: ImageGenerateRequest | AsyncGenerateRequest) {
  return {
    prompt: req.prompt,
    negative_prompt: req.negativePrompt ?? null,
    model: (req as ImageGenerateRequest).model,
    seed: req.seed ?? null,
    metadata: req.metadata ?? {},
    idempotency_key: req.idempotencyKey ?? null,
  }
}

export async function postImageGeneration(
  req: ImageGenerateRequest,
  idempotencyKey: string,
): Promise<ImageGenerateResponse> {
  return apiRequest<ImageGenerateResponse>('/api/generation/image', {
    method: 'POST',
    body: JSON.stringify(toSnake(req)),
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function postVideoGeneration(
  req: AsyncGenerateRequest,
  idempotencyKey: string,
): Promise<AsyncGenerateResponse> {
  return apiRequest<AsyncGenerateResponse>('/api/generation/video', {
    method: 'POST',
    body: JSON.stringify(toSnake(req)),
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function postAudioGeneration(
  req: AsyncGenerateRequest,
  idempotencyKey: string,
): Promise<AsyncGenerateResponse> {
  return apiRequest<AsyncGenerateResponse>('/api/generation/audio', {
    method: 'POST',
    body: JSON.stringify(toSnake(req)),
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function getGenerationJobs(
  workspaceId: string,
  opts?: { mode?: string; status?: string; cursor?: string; limit?: number },
): Promise<JobsPage> {
  const params = new URLSearchParams({ workspace_id: workspaceId })
  if (opts?.mode) params.set('mode', opts.mode)
  if (opts?.status) params.set('status', opts.status)
  if (opts?.cursor) params.set('cursor', opts.cursor)
  if (opts?.limit) params.set('limit', String(opts.limit))
  return apiRequest<JobsPage>(`/api/generation/jobs?${params}`)
}

export async function getInflightJobs(workspaceId: string): Promise<{ jobs: GenerationJob[] }> {
  return apiRequest<{ jobs: GenerationJob[] }>(
    `/api/generation/jobs?workspace_id=${workspaceId}&status=queued,preprocessing,running,postprocessing,persisting`,
  )
}

export async function deleteGenerationJob(jobId: string): Promise<void> {
  await apiRequest<void>(`/api/generation/jobs/${jobId}`, { method: 'DELETE' })
}

export async function patchFavorite(assetId: string): Promise<{ is_favorite: boolean }> {
  return apiRequest<{ is_favorite: boolean }>(`/api/generation/assets/${assetId}/favorite`, {
    method: 'PATCH',
  })
}
