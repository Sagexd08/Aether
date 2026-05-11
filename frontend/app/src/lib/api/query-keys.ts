export const QK = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,
  projects: (workspaceId: string) => ['projects', workspaceId] as const,
  notifications: (workspaceId: string) => ['notifications', workspaceId] as const,
  generations: (workspaceId: string) => ['generations', workspaceId] as const,
  datasets: (workspaceId: string) => ['datasets', workspaceId] as const,
  trainingJobs: (workspaceId: string) => ['training-jobs', workspaceId] as const,
  models: (workspaceId: string) => ['models', workspaceId] as const,
} as const
