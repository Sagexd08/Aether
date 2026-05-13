'use client'

import { useAuthStore } from '@/lib/store/auth'
import { WorkspaceShell } from '@/components/workspace/app-shell'
import { DatasetConsole } from '@/components/workspace/dataset-console'
import { useDatasetReconcile } from '@/lib/hooks/use-dataset-reconcile'
import { useWorkspaceWebSocket } from '@/lib/hooks/use-websocket'

export default function DatasetsPage() {
  const workspace = useAuthStore((s) => s.workspace)
  const workspaceId = workspace?.id ?? ''

  const { lastEvent } = useWorkspaceWebSocket(workspaceId)
  useDatasetReconcile(workspaceId, lastEvent)

  return (
    <WorkspaceShell title="Datasets" subtitle="Import and inspect training datasets">
      <div className="p-6">
        {workspaceId ? (
          <DatasetConsole workspaceId={workspaceId} />
        ) : (
          <p className="text-white/20 text-sm">Loading workspace…</p>
        )}
      </div>
    </WorkspaceShell>
  )
}
