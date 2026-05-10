'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DatabaseZap, FileCheck2, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { api, type Dataset } from '@/lib/api'
import { cn } from '@/lib/utils'

const sources: { id: Dataset['source']; label: string; hint: string }[] = [
  { id: 'huggingface', label: 'Hugging Face', hint: 'owner/dataset-name' },
  { id: 'kaggle', label: 'Kaggle', hint: 'owner/dataset-slug' },
  { id: 'local', label: 'Local upload', hint: 'manifest or archive name' },
]

export function DatasetConsole() {
  const queryClient = useQueryClient()
  const [source, setSource] = useState<Dataset['source']>('huggingface')
  const [sourceRef, setSourceRef] = useState('lambdalabs/pokemon-blip-captions')
  const [name, setName] = useState('')
  const datasets = useQuery({ queryKey: ['datasets'], queryFn: api.listDatasets })
  const importer = useMutation({
    mutationFn: api.importDataset,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasets'] }),
  })

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="glass-panel rounded-[28px] p-5">
          <div className="flex items-center gap-3 text-white">
            <DatabaseZap className="h-5 w-5 text-[#63b3ed]" />
            <h2 className="font-display text-2xl">Secure import</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {sources.map((item) => (
              <button
                key={item.id}
                onClick={() => setSource(item.id)}
                className={cn('rounded-[18px] border px-4 py-3 text-left transition', source === item.id ? 'border-white/30 bg-white text-black' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10')}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className={cn('mt-1 block text-xs', source === item.id ? 'text-black/55' : 'text-white/40')}>{item.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            <input value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[#63b3ed]/50" placeholder="Dataset reference" />
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[#a78bfa]/50" placeholder="Display name optional" />
            <button
              onClick={() => importer.mutate({ source, source_ref: sourceRef, name: name || undefined })}
              disabled={importer.isPending || !sourceRef}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importer.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Import and validate
            </button>
            {importer.error ? <p className="text-sm text-rose-300">{importer.error.message}</p> : null}
          </div>
        </div>

        <div className="glass-panel rounded-[28px] p-5">
          <div className="flex items-center gap-3 text-white">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h2 className="font-display text-2xl">Ingestion policy</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {['Schema validation', 'Media type inspection', 'Deduplication plan', 'Caption coverage scan', 'Low-quality filtering', 'Lineage capture'].map((item) => (
              <div key={item} className="rounded-[18px] border border-white/8 bg-white/4 p-4 text-sm text-white/70">
                <FileCheck2 className="mb-3 h-4 w-4 text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {(datasets.data ?? []).map((dataset) => (
          <article key={dataset.id} className="glass-panel rounded-[24px] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">{dataset.source}</div>
                <h3 className="mt-2 font-display text-2xl text-white">{dataset.name}</h3>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">{dataset.status}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Metric label="records" value={dataset.row_count.toLocaleString()} />
              <Metric label="columns" value={String(dataset.columns.length)} />
              <Metric label="media" value={dataset.media_types.join(', ')} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {dataset.columns.slice(0, 6).map((column) => (
                <span key={column.name} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">{column.name}</span>
              ))}
            </div>
          </article>
        ))}
        {datasets.isLoading ? <div className="glass-panel rounded-[24px] p-5 text-sm text-white/50">Loading datasets...</div> : null}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/8 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-2 truncate text-white/80">{value}</div>
    </div>
  )
}
