import { CommandBar } from '@/components/workspace/command-bar'
import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function WorkspacePage() {
  return (
    <WorkspaceShell
      title="Workspace"
      subtitle="Compose prompts, orchestrate generation modes, and manage the live output timeline from one AI-native control room."
    >
      <div className="space-y-6">
        <CommandBar />
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="glass-panel rounded-[28px] p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-white/45">Live generation stream</div>
            <h2 className="mt-3 font-display text-3xl text-white">Text studio</h2>
            <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-5 text-sm leading-8 text-white/65">
              Streaming responses, rewrite controls, export actions, and memory recall will render here.
            </div>
          </div>
          <div className="glass-panel rounded-[28px] p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-white/45">Timeline</div>
            <h2 className="mt-3 font-display text-3xl text-white">Recent generations</h2>
            <div className="mt-6 space-y-3">
              {['Queued video prompt', 'Completed hero image set', 'Audio ambience pass'].map((item) => (
                <div key={item} className="rounded-[22px] border border-white/8 bg-white/4 p-4 text-sm text-white/70">{item}</div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  )
}
