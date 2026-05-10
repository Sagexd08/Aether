'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Cpu, Gauge, GitBranch, Play, Rocket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '@/lib/api'

export function TrainingConsole() {
  const queryClient = useQueryClient()
  const datasets = useQuery({ queryKey: ['datasets'], queryFn: api.listDatasets })
  const jobs = useQuery({ queryKey: ['training-jobs'], queryFn: api.listTrainingJobs })
  const [datasetId, setDatasetId] = useState('')
  const [adapterMethod, setAdapterMethod] = useState('lora')
  const activeDataset = useMemo(() => datasets.data?.find((dataset) => dataset.id === datasetId) ?? datasets.data?.[0], [datasets.data, datasetId])
  const createJob = useMutation({
    mutationFn: api.createTrainingJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['training-jobs'] }),
  })
  const completeJob = useMutation({
    mutationFn: api.completeTrainingJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
  })

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[28px] p-5">
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
          <label className="block text-sm text-white/70">
            <span className="mb-2 block">Validated dataset</span>
            <select value={activeDataset?.id ?? ''} onChange={(event) => setDatasetId(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">
              {(datasets.data ?? []).map((dataset) => (
                <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-white/70">
            <span className="mb-2 block">Adaptation strategy</span>
            <select value={adapterMethod} onChange={(event) => setAdapterMethod(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">
              {['lora', 'qlora', 'adapter', 'prompt', 'sklearn-baseline'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              activeDataset &&
              createJob.mutate({
                dataset_id: activeDataset.id,
                task_type: 'multimodal-retrieval',
                base_model: adapterMethod === 'sklearn-baseline' ? 'sklearn/tfidf-logistic-regression' : 'sentence-transformers/all-MiniLM-L6-v2',
                adapter_method: adapterMethod,
              })
            }
            disabled={!activeDataset || createJob.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Launch job
          </button>
        </div>
        {createJob.error ? <p className="mt-3 text-sm text-rose-300">{createJob.error.message}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {(jobs.data ?? []).map((job) => (
          <article key={job.id} className="glass-panel rounded-[26px] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">{job.adapter_method}</div>
                <h3 className="mt-2 font-display text-2xl text-white">{job.task_type}</h3>
              </div>
              <span className="rounded-full border border-[#63b3ed]/20 bg-[#63b3ed]/10 px-3 py-1 text-xs text-[#9bd4ff]">{job.status}</span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-white" style={{ width: `${job.progress}%` }} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Status icon={Gauge} label="progress" value={`${job.progress}%`} />
              <Status icon={Cpu} label="worker" value={job.worker_status} />
              <Status icon={GitBranch} label="checkpoints" value={String(job.checkpoint_versions.length)} />
              <Status icon={BadgeCheck} label="artifact" value={job.artifact_paths.preprocessor_pkl ? '.pkl ready' : 'pending'} />
            </div>
            <div className="mt-5 rounded-[18px] border border-white/8 bg-black/20 p-4 font-mono text-xs leading-6 text-white/55">
              {Object.entries(job.artifact_paths).map(([key, value]) => (
                <div key={key}>{key}: {value}</div>
              ))}
            </div>
            {job.status !== 'succeeded' ? (
              <button onClick={() => completeJob.mutate(job.id)} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10">
                <Rocket className="h-4 w-4" />
                Register checkpoint
              </button>
            ) : null}
          </article>
        ))}
        {jobs.isLoading ? <div className="glass-panel rounded-[26px] p-5 text-white/50">Loading training jobs...</div> : null}
      </section>
    </div>
  )
}

function Status({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/8 bg-white/4 p-3">
      <Icon className="h-4 w-4 text-white/55" />
      <div className="mt-3 text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-sm text-white/75">{value}</div>
    </div>
  )
}
