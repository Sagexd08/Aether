import { WorkspaceShell } from '@/components/workspace/app-shell'
import { WorkspaceDashboard } from '@/components/workspace/workspace-dashboard'

export default function WorkspacePage() {
  return (
    <WorkspaceShell
      title="Workspace"
      subtitle="Your projects, generations, and assets — all in one cinematic control room."
    >
      <WorkspaceDashboard />
    </WorkspaceShell>
  )
}
