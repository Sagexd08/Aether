import { WorkspaceShell } from '@/components/workspace/app-shell'
import { ModelRegistry } from '@/components/workspace/model-registry'

export default function ModelsPage() {
  return (
    <WorkspaceShell title="Model Registry" subtitle="Promote, rollback, and inspect base models, fine-tuned variants, metrics, and artifact locations.">
      <ModelRegistry />
    </WorkspaceShell>
  )
}
