import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function TeamPage() {
  return (
    <WorkspaceShell title="Team" subtitle="Shared workspaces, comments, permissions, and live presence for collaborative creative production.">
      <div className="glass-panel rounded-[28px] p-5">
        <h2 className="font-display text-3xl text-white">Collaboration surface</h2>
        <p className="mt-3 text-sm leading-7 text-white/55">Invites, annotations, and live presence indicators are scaffolded for team workflows.</p>
      </div>
    </WorkspaceShell>
  )
}
