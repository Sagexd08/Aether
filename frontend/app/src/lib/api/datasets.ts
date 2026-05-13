import type { Dataset } from '@aether/types'
import { apiRequest } from './client'

export interface DatasetImportRequest {
  source: 'huggingface' | 'kaggle' | 'local'
  sourceRef: string
  name?: string
  workspaceId?: string
}

export interface DatasetImportResponse {
  dataset_id: string
  status: string
}

export interface DatasetPreviewPage {
  rows: Record<string, unknown>[]
  total: number
  offset: number
  limit: number
}

function toSnakeImport(req: DatasetImportRequest) {
  return {
    source: req.source,
    source_ref: req.sourceRef,
    name: req.name ?? null,
    workspace_id: req.workspaceId ?? null,
  }
}

function mapDataset(raw: Record<string, unknown>): Dataset {
  return {
    id: raw.id as string,
    workspaceId: raw.workspace_id as string,
    source: raw.source as Dataset['source'],
    sourceRef: raw.source_ref as string,
    name: raw.name as string,
    status: raw.status as Dataset['status'],
    progress: (raw.progress as number) ?? 0,
    rowCount: (raw.row_count as number) ?? 0,
    sampleCount: (raw.sample_count as number) ?? 0,
    mediaTypes: (raw.media_types as string[]) ?? [],
    columns: (raw.columns as Dataset['columns']) ?? [],
    qualityReport: (raw.quality_report as Dataset['qualityReport']) ?? null,
    previewSamples: (raw.preview_samples as Record<string, unknown>[]) ?? [],
    lineage: (raw.lineage as Record<string, unknown>) ?? {},
    ingestionConfig: (raw.ingestion_config as Record<string, unknown>) ?? {},
    errorMessage: (raw.error_message as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  }
}

export async function postDatasetImport(
  req: DatasetImportRequest,
): Promise<DatasetImportResponse> {
  return apiRequest<DatasetImportResponse>('/api/datasets/import', {
    method: 'POST',
    body: JSON.stringify(toSnakeImport(req)),
  })
}

export async function getDatasets(workspaceId: string): Promise<Dataset[]> {
  const raw = await apiRequest<Record<string, unknown>[]>(
    `/api/datasets?workspace_id=${workspaceId}`,
  )
  return raw.map(mapDataset)
}

export async function getInflightDatasets(workspaceId: string): Promise<Dataset[]> {
  const raw = await apiRequest<Record<string, unknown>[]>(
    `/api/datasets?workspace_id=${workspaceId}&status=queued,inspecting,analyzing,previewing`,
  )
  return raw.map(mapDataset)
}

export async function getDataset(id: string): Promise<Dataset> {
  const raw = await apiRequest<Record<string, unknown>>(`/api/datasets/${id}`)
  return mapDataset(raw)
}

export async function getDatasetPreview(
  id: string,
  offset = 0,
  limit = 10,
): Promise<DatasetPreviewPage> {
  return apiRequest<DatasetPreviewPage>(
    `/api/datasets/${id}/preview?offset=${offset}&limit=${limit}`,
  )
}

export async function deleteDataset(id: string): Promise<void> {
  await apiRequest<void>(`/api/datasets/${id}`, { method: 'DELETE' })
}
