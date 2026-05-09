import { WorkspaceShell } from '@/components/workspace/app-shell'

export default function BillingPage() {
  return (
    <WorkspaceShell title="Billing" subtitle="Track plan status, credit consumption, usage analytics, and upgrades inside a luxury fintech surface.">
      <div className="grid gap-6 xl:grid-cols-3">
        {['Starter', 'Studio', 'Enterprise'].map((plan, index) => (
          <div key={plan} className="glass-panel rounded-[28px] p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-white/45">Plan {index + 1}</div>
            <h2 className="mt-3 font-display text-3xl text-white">{plan}</h2>
            <p className="mt-3 text-sm leading-7 text-white/55">Premium generation credits, shared team features, and workflow capacity tuned for creators.</p>
            <button className="mt-6 rounded-full bg-white px-5 py-3 text-sm text-black">Choose plan</button>
          </div>
        ))}
      </div>
    </WorkspaceShell>
  )
}
