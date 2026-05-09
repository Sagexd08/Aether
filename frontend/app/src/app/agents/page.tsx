import { WorkspaceShell } from '@/components/workspace/app-shell'

const agents = [
  ['Storyboard Agent', 'Turns rough ideas into shot-by-shot visual sequences.'],
  ['Thumbnail Agent', 'Composes high-impact key art and cover frames.'],
  ['Copywriter', 'Writes campaign-ready messaging and narrative variants.'],
  ['Social Clip Generator', 'Repurposes longform assets into short-form launch content.'],
]

export default function AgentsPage() {
  return (
    <WorkspaceShell title="Agents" subtitle="Specialized AI collaborators with dedicated operating modes, prompts, and orchestration hooks.">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {agents.map(([title, body]) => (
          <article key={title} className="glass-panel rounded-[28px] p-5">
            <div className="mb-5 h-14 w-14 rounded-2xl bg-[linear-gradient(135deg,rgba(99,179,237,0.18),rgba(167,139,250,0.28))]" />
            <h2 className="font-display text-2xl text-white">{title}</h2>
            <p className="mt-3 text-sm leading-7 text-white/55">{body}</p>
            <button className="mt-6 rounded-full bg-white px-4 py-2 text-sm text-black">Open agent</button>
          </article>
        ))}
      </div>
    </WorkspaceShell>
  )
}
