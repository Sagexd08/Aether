import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function VideoPage() {
  return (
    <WorkspaceShell title="Video Studio" subtitle="Queue text-to-video and image-to-video generations with timeline review, shot pacing, and export controls.">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-panel rounded-[28px] p-5">
          <h2 className="font-display text-3xl text-white">Player</h2>
          <div className="mt-5 aspect-video rounded-[24px] bg-[linear-gradient(135deg,rgba(99,179,237,0.12),rgba(12,15,26,0.95))]" />
          <div className="mt-4 rounded-full border border-white/8 bg-white/5 px-4 py-3 text-sm text-white/65">Timeline scrubber placeholder</div>
        </div>
        <div className="glass-panel rounded-[28px] p-5">
          <h2 className="font-display text-3xl text-white">Storyboard</h2>
          <p className="mt-3 text-sm leading-7 text-white/55">Scene cards, motion presets, soundtrack sync, and export queue will be coordinated here.</p>
        </div>
      </div>
    </WorkspaceShell>
  )
}
