import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function DatasetsPage() {
  return (
    <WorkspaceShell title="Datasets" subtitle="Upload training sets, import from Hugging Face or Kaggle, and manage fine-tune preparation flows.">
      <div className="grid gap-6 lg:grid-cols-3">
        {['Local upload', 'Hugging Face import', 'Kaggle import'].map((item) => (
          <div key={item} className="glass-panel rounded-[28px] p-5">
            <h2 className="font-display text-2xl text-white">{item}</h2>
            <p className="mt-3 text-sm leading-7 text-white/55">Validation, tagging, caption generation, and checkpoint promotion are staged here.</p>
          </div>
        ))}
      </div>
    </WorkspaceShell>
  )
}
