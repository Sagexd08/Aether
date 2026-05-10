import { WorkspaceShell } from '@/components/workspace/app-shell'
import { TrainingConsole } from '@/components/workspace/training-console'

export default function TrainingPage() {
  return (
    <WorkspaceShell
      title="Training"
      subtitle="Launch adapter fine-tunes, sklearn baselines, retrieval components, and checkpoint registration from one orchestration surface."
    >
      <TrainingConsole />
    </WorkspaceShell>
  )
}
