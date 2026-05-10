'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, RotateCcw, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'

export function ModelRegistry() {
  const queryClient = useQueryClient()
  const models = useQuery({ queryKey: ['models'], queryFn: api.listModels })
  const promote = useMutation({
    mutationFn: api.promoteModel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  })
  const rollback = useMutation({
    mutationFn: api.rollbackModel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  })

  return (
    <div className="grid gap-4">
      {(models.data ?? []).map((model) => (
        <article key={model.id} className="glass-panel rounded-[26px] p-5">
          <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-3xl text-white">{model.name}</h2>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-white/55">{model.version}</span>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">{model.deployment_status}</span>
              </div>
              <p className="mt-3 text-sm text-white/55">{model.base_model}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Info label="format" value={model.artifact_format} />
                <Info label="eval accuracy" value={String(model.metrics.eval_accuracy ?? 'pending')} />
                <Info label="created" value={new Date(model.created_at).toLocaleDateString()} />
              </div>
              <div className="mt-4 rounded-[18px] border border-white/8 bg-black/20 p-4 font-mono text-xs text-white/50">{model.artifact_uri}</div>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button onClick={() => promote.mutate(model.id)} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black">
                <ShieldCheck className="h-4 w-4" />
                Promote
              </button>
              <button onClick={() => rollback.mutate(model.id)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75">
                <RotateCcw className="h-4 w-4" />
                Rollback
              </button>
            </div>
          </div>
        </article>
      ))}
      {!models.isLoading && !models.data?.length ? (
        <div className="glass-panel rounded-[26px] p-8 text-center">
          <History className="mx-auto h-8 w-8 text-white/35" />
          <h2 className="mt-4 font-display text-2xl text-white">No registered models yet</h2>
          <p className="mt-2 text-sm text-white/50">Register a training checkpoint to stage a model for deployment.</p>
        </div>
      ) : null}
      {models.isLoading ? <div className="glass-panel rounded-[26px] p-5 text-white/50">Loading registry...</div> : null}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/8 bg-white/4 p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-2 truncate text-sm text-white/75">{value}</div>
    </div>
  )
}
