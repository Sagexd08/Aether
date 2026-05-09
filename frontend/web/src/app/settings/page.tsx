import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function SettingsPage() {
  return (
    <WorkspaceShell title="Settings" subtitle="Manage profile, API keys, connected services, notification preferences, and appearance tuning.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-[28px] p-5">
          <h2 className="font-display text-3xl text-white">Profile</h2>
          <p className="mt-3 text-sm leading-7 text-white/55">Name, avatar, email, and workspace identity controls.</p>
        </div>
        <div className="glass-panel rounded-[28px] p-5">
          <h2 className="font-display text-3xl text-white">Connected services</h2>
          <p className="mt-3 text-sm leading-7 text-white/55">Hugging Face, Replicate, and provider credentials remain server-side and env-driven.</p>
        </div>
      </div>
    </WorkspaceShell>
  )
}
