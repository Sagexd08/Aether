import { CommandBar } from '@/components/workspace/command-bar'
import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function GeneratePage() {
  return (
    <WorkspaceShell
      title="Generate"
      subtitle="Switch across text, image, video, and audio modes with enhancement, attachments, and premium control states."
    >
      <div className="space-y-6">
        <CommandBar />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass-panel rounded-[28px] p-5">
            <h2 className="font-display text-3xl text-white">Mode output</h2>
            <p className="mt-3 text-sm leading-7 text-white/55">Pending cards, streaming text, and media previews will populate this stage.</p>
          </div>
          <div className="glass-panel rounded-[28px] p-5">
            <h2 className="font-display text-3xl text-white">Generation controls</h2>
            <p className="mt-3 text-sm leading-7 text-white/55">Prompt enhancement, negative prompts, style presets, camera motion, and workflow chaining live here.</p>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
