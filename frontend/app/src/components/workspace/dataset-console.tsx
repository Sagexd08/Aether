'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { DatabaseZap, FileCheck2, Loader2, ShieldCheck, Trash2, UploadCloud, Eye } from 'lucide-react'
import type { Dataset, DatasetStatus } from '@aether/types'
import { useDatasetStore } from '@/lib/store/dataset'
import { postDatasetImport, getDatasets, getDatasetPreview, deleteDataset } from '@/lib/api/datasets'
import { QK } from '@/lib/api/query-keys'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const SOURCES: { id: Dataset['source']; label: string; hint: string }[] = [
  { id: 'huggingface', label: 'Hugging Face', hint: 'owner/dataset-name' },
  { id: 'kaggle', label: 'Kaggle', hint: 'owner/dataset-slug' },
  { id: 'local', label: 'Local upload', hint: 'Coming in next sprint' },
]

const STAGE_LABELS: Record<DatasetStatus, string> = {
  queued: 'Queued…',
  inspecting: 'Inspecting schema…',
  analyzing: 'Analyzing quality…',
  previewing: 'Fetching preview…',
  completed: 'Ready',
  failed: 'Failed',
}

interface Props {
  workspaceId: string
}

export function DatasetConsole({ workspaceId }: Props) {
  const queryClient = useQueryClient()
  const store = useDatasetStore()
  const [source, setSource] = useState<Dataset['source']>('huggingface')
  const [sourceRef, setSourceRef] = useState('lambdalabs/pokemon-blip-captions')
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewDatasetId, setPreviewDatasetId] = useState<string | null>(null)

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: QK.datasets(workspaceId),
    queryFn: () => getDatasets(workspaceId),
    enabled: !!workspaceId,
  })

  const { data: preview } = useQuery({
    queryKey: QK.datasetPreview(previewDatasetId ?? ''),
    queryFn: () => getDatasetPreview(previewDatasetId!),
    enabled: !!previewDatasetId,
  })

  const handleImport = async () => {
    if (!sourceRef || source === 'local') return
    setIsSubmitting(true)
    try {
      const res = await postDatasetImport({ source, sourceRef, name: name || undefined, workspaceId })
      store.setIngesting({
        datasetId: res.dataset_id,
        sourceRef,
        name: name || sourceRef.split('/').pop() || sourceRef,
        status: 'queued',
        progress: 0,
        errorMessage: null,
        createdAt: Date.now(),
      })
      toast.success('Dataset ingestion started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    queryClient.setQueryData<Dataset[]>(QK.datasets(workspaceId), (old) =>
      (old ?? []).filter((d) => d.id !== id),
    )
    try {
      await deleteDataset(id)
    } catch {
      queryClient.invalidateQueries({ queryKey: QK.datasets(workspaceId) })
      toast.error('Failed to delete dataset')
    }
  }

  // Active ingestions not yet in the server list
  const activeIds = new Set(datasets.map((d) => d.id))
  const activeCards = Object.values(store.activeIngestions).filter(
    (a) => !activeIds.has(a.datasetId) && a.status !== 'completed',
  )

  return (
    <div className="space-y-6">
      {/* Import panel */}
      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="glass-panel rounded-[28px] p-5">
          <div className="flex items-center gap-3 text-white">
            <DatabaseZap className="h-5 w-5 text-[#63b3ed]" />
            <h2 className="font-display text-2xl">Secure import</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {SOURCES.map((item) => (
              <button
                key={item.id}
                onClick={() => item.id !== 'local' && setSource(item.id)}
                disabled={item.id === 'local'}
                className={cn(
                  'rounded-[18px] border px-4 py-3 text-left transition',
                  source === item.id
                    ? 'border-white/30 bg-white text-black'
                    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
                  item.id === 'local' && 'cursor-not-allowed opacity-40',
                )}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className={cn('mt-1 block text-xs', source === item.id ? 'text-black/55' : 'text-white/40')}>
                  {item.hint}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            <input
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[#63b3ed]/50"
              placeholder="Dataset reference"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[#a78bfa]/50"
              placeholder="Display name (optional)"
            />
            <button
              onClick={handleImport}
              disabled={isSubmitting || !sourceRef || source === 'local'}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Import and validate
            </button>
          </div>
        </div>

        {/* Ingestion policy */}
        <div className="glass-panel rounded-[28px] p-5">
          <div className="flex items-center gap-3 text-white">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h2 className="font-display text-2xl">Ingestion policy</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {['Schema validation', 'Media type inspection', 'Null rate analysis', 'Duplicate detection', 'Language detection', 'Lineage capture'].map((item) => (
              <div key={item} className="rounded-[18px] border border-white/8 bg-white/4 p-4 text-sm text-white/70">
                <FileCheck2 className="mb-3 h-4 w-4 text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dataset cards */}
      <section className="grid gap-4 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {/* Active ingestion cards (not yet in server list) */}
          {activeCards.map((active) => (
            <motion.article
              key={active.datasetId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel rounded-[24px] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/40">{active.sourceRef}</div>
                  <h3 className="mt-2 font-display text-2xl text-white">{active.name}</h3>
                </div>
                <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs text-blue-200">
                  {STAGE_LABELS[active.status]}
                </span>
              </div>
              <div className="mt-4 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white/50 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${active.progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="mt-2 text-xs text-white/30">{active.progress}%</p>
            </motion.article>
          ))}

          {/* Persisted dataset cards */}
          {datasets.map((dataset) => {
            const active = store.activeIngestions[dataset.id]
            const displayStatus = (active?.status ?? dataset.status) as DatasetStatus
            const displayProgress = active?.progress ?? dataset.progress
            const isIngesting = !['completed', 'failed'].includes(displayStatus)

            return (
              <motion.article
                key={dataset.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel rounded-[24px] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-white/40">{dataset.source}</div>
                    <h3 className="mt-2 font-display text-2xl text-white">{dataset.name}</h3>
                  </div>
                  <span className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    displayStatus === 'completed' && 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
                    displayStatus === 'failed' && 'border-red-400/20 bg-red-400/10 text-red-200',
                    isIngesting && 'border-blue-400/20 bg-blue-400/10 text-blue-200',
                  )}>
                    {STAGE_LABELS[displayStatus]}
                  </span>
                </div>

                {isIngesting && (
                  <div className="mt-3 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white/50 rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${displayProgress}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}

                {displayStatus === 'completed' && (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <Metric label="records" value={dataset.rowCount.toLocaleString()} />
                      <Metric label="columns" value={String(dataset.columns.length)} />
                      <Metric label="samples" value={String(dataset.sampleCount)} />
                    </div>
                    {dataset.qualityReport && (
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/60">
                        <div className="rounded-xl bg-white/5 px-3 py-2">
                          Lang: <span className="text-white/80">{dataset.qualityReport.language}</span>
                        </div>
                        <div className="rounded-xl bg-white/5 px-3 py-2">
                          Dupes: <span className="text-white/80">{(dataset.qualityReport.duplicate_estimate * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dataset.columns.slice(0, 6).map((col) => (
                        <span key={col.name} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
                          {col.name}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {displayStatus === 'failed' && (
                  <p className="mt-3 text-xs text-red-400/70">{dataset.errorMessage ?? 'Ingestion failed'}</p>
                )}

                <div className="mt-4 flex gap-2">
                  {displayStatus === 'completed' && (
                    <button
                      onClick={() => setPreviewDatasetId(previewDatasetId === dataset.id ? null : dataset.id)}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
                    >
                      <Eye className="h-3 w-3" /> Preview
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(dataset.id)}
                    className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:border-red-400/30 hover:text-red-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Preview table */}
                {previewDatasetId === dataset.id && preview && preview.rows.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-xs text-white/60">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          {Object.keys(preview.rows[0]).slice(0, 6).map((col) => (
                            <th key={col} className="px-3 py-2 text-left font-medium text-white/40">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-white/5">
                            {Object.keys(preview.rows[0]).slice(0, 6).map((col) => (
                              <td key={col} className="max-w-[120px] truncate px-3 py-2">
                                {String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-3 py-2 text-xs text-white/30">{preview.total} total rows</p>
                  </div>
                )}
              </motion.article>
            )
          })}
        </AnimatePresence>

        {isLoading && (
          <div className="glass-panel rounded-[24px] p-5 text-sm text-white/50">Loading datasets…</div>
        )}
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
