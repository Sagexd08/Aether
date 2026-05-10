import { WorkspaceShell } from '@/components/workspace/app-shell'
import { DatasetConsole } from '@/components/workspace/dataset-console'

export default function DatasetsPage() {
  return (
    <WorkspaceShell title="Datasets" subtitle="Upload training sets, import from Hugging Face or Kaggle, and manage fine-tune preparation flows.">
      <DatasetConsole />
    </WorkspaceShell>
  )
}
