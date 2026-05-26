export const QK = {
  generations: (sessionId: string, mode?: string) =>
    mode ? (['generations', sessionId, mode] as const) : (['generations', sessionId] as const),
  generationJob: (jobId: string) => ['generation-job', jobId] as const,
  generationJobsInflight: (sessionId: string) => ['generations-inflight', sessionId] as const,
  notifications: (workspaceId: string) => ['notifications', workspaceId] as const,
  datasets: (workspaceId: string) => ['datasets', workspaceId] as const,
  datasetPreview: (datasetId: string) => ['dataset-preview', datasetId] as const,
  projects: (workspaceId: string) => ['projects', workspaceId] as const,
} as const
