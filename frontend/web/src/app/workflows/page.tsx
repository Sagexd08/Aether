import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function WorkflowsPage() {
  return (
    <WorkspaceShell title="Workflows" subtitle="AETHER chains prompts, transformations, and generation steps into reusable automated pipelines.">
      <div className="glass-panel rounded-[30px] p-6">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_220px]">
          <div className="rounded-[24px] border border-white/8 bg-white/4 p-4 text-sm text-white/70">Prompt In</div>
          <div className="rounded-[24px] border border-[#63b3ed]/25 bg-[#63b3ed]/10 p-4 text-sm text-white/80">Enhance → Generate Image → Generate Caption</div>
          <div className="rounded-[24px] border border-white/8 bg-white/4 p-4 text-sm text-white/70">Save to Gallery</div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
