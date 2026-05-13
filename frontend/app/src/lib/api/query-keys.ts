export const QK = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,
  projects: (workspaceId: string) => ['projects', workspaceId] as const,
  notifications: (workspaceId: string) => ['notifications', workspaceId] as const,
  generations: (workspaceId: string, mode?: string) =>
    mode ? (['generations', workspaceId, mode] as const) : (['generations', workspaceId] as const),
  generationJob: (jobId: string) => ['generation-job', jobId] as const,
  generationJobsInflight: (workspaceId: string) => ['generations-inflight', workspaceId] as const,
  datasets: (workspaceId: string) => ['datasets', workspaceId] as const,
  dataset: (id: string) => ['dataset', id] as const,
  datasetPreview: (id: string) => ['dataset-preview', id] as const,
  trainingJobs: (workspaceId: string) => ['training-jobs', workspaceId] as const,
  models: (workspaceId: string) => ['models', workspaceId] as const,
} as const
