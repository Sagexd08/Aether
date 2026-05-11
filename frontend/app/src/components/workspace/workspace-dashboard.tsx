'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Plus, Sparkles, Zap } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { createProject, listProjects } from '@/lib/api/workspaces'
import { QK } from '@/lib/api/query-keys'
import { SkeletonCard } from '@/components/ui/skeleton'
import { ProjectCard } from './project-card'
import { CreateProjectModal } from './create-project-modal'
import { toast } from '@/components/ui/toast'
import type { Project } from '@aether/types'

export function WorkspaceDashboard() {
  const { user, workspace } = useAuthStore()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const projectsQuery = useQuery({
    queryKey: QK.projects(workspace?.id ?? ''),
    queryFn: () => listProjects(workspace!.id),
    enabled: !!workspace?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; mode: Project['mode'] }) =>
      createProject(workspace!.id, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: QK.projects(workspace!.id) })
      const previous = queryClient.getQueryData<Project[]>(QK.projects(workspace!.id))
      const optimistic: Project = {
        id: `optimistic-${Date.now()}`,
        workspaceId: workspace!.id,
        name: data.name,
        description: data.description ?? null,
        mode: data.mode ?? 'multimodal',
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<Project[]>(QK.projects(workspace!.id), (old) => [
        optimistic,
        ...(old ?? []),
      ])
      return { previous }
    },
    onError: (_err, _data, context) => {
      queryClient.setQueryData(QK.projects(workspace!.id), context?.previous)
      setModalError(_err instanceof Error ? _err.message : 'Failed to create project')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.projects(workspace!.id) })
      setModalOpen(false)
      setModalError(null)
      toast.success('Project created')
    },
  })

  const projects = projectsQuery.data ?? []
  const realProjectCount = projects.filter((p) => !p.id.startsWith('optimistic')).length

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FolderOpen} label="Total projects" value={String(realProjectCount)} color="text-[#63b3ed]" />
        <StatCard icon={Sparkles} label="Active generations" value="0" color="text-[#a78bfa]" />
        <StatCard
          icon={Zap}
          label="Credits remaining"
          value={(user?.creditsRemaining ?? 0).toLocaleString()}
          color="text-emerald-400"
        />
      </div>

      {/* Projects header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-white">Projects</h2>
        <button
          onClick={() => { setModalError(null); setModalOpen(true) }}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          New project
        </button>
      </div>

      {/* Projects grid */}
      {projectsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-panel rounded-[28px] p-12 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-white/20" />
          <p className="mt-4 font-display text-xl text-white/50">No projects yet</p>
          <p className="mt-2 text-sm text-white/30">Create your first project to get started.</p>
          <button
            onClick={() => { setModalError(null); setModalOpen(true) }}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:scale-[1.02]"
          >
            <Plus className="h-4 w-4" />
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <CreateProjectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={(data) => createMutation.mutateAsync(data)}
        error={modalError}
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof FolderOpen
  label: string
  value: string
  color: string
}) {
  return (
    <div className="glass-panel rounded-[24px] p-5">
      <Icon className={`h-5 w-5 ${color}`} />
      <p className="mt-4 text-xs uppercase tracking-[0.22em] text-white/40">{label}</p>
      <p className="mt-2 font-display text-3xl text-white">{value}</p>
    </div>
  )
}
