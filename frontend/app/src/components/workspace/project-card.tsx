import type { Project } from '@aether/types'
import type { Route } from 'next'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

const MODE_COLORS: Record<Project['mode'], string> = {
  multimodal: 'border-[#a78bfa]/20 bg-[#a78bfa]/10 text-[#c4b5fd]',
  text: 'border-[#63b3ed]/20 bg-[#63b3ed]/10 text-[#9bd4ff]',
  image: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  video: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
}

export function ProjectCard({ project }: { project: Project }) {
  const date = new Date(project.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <article className="glass-panel group rounded-[26px] p-5 transition hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${MODE_COLORS[project.mode]}`}>
            {project.mode}
          </span>
          <h3 className="mt-3 font-display text-xl text-white">{project.name}</h3>
          {project.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/50">{project.description}</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-white/35">{date}</span>
        <Link
          href={`/workspace?project=${project.id}` as Route}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  )
}
