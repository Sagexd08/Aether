import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function AudioPage() {
  return (
    <WorkspaceShell title="Audio Studio" subtitle="Generate narration, soundtrack, ambience, and layered sound design with waveform-first controls.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-[28px] p-5">
          <h2 className="font-display text-3xl text-white">Waveform</h2>
          <div className="mt-5 h-56 rounded-[24px] bg-[linear-gradient(180deg,rgba(52,211,153,0.12),rgba(12,15,26,0.96))]" />
        </div>
        <div className="glass-panel rounded-[28px] p-5">
          <h2 className="font-display text-3xl text-white">Voice presets</h2>
          <p className="mt-3 text-sm leading-7 text-white/55">Narration voices, soundtrack controls, and ambience stacks will appear here.</p>
        </div>
      </div>
    </WorkspaceShell>
  )
}
