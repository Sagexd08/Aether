'use client'

import { motion } from 'framer-motion'
import { Download, Heart, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import type { ActiveGenerationState } from '@/lib/store/generation'
import { useGenerationStore } from '@/lib/store/generation'
import { deleteGenerationJob, patchFavorite, postImageGeneration, postVideoGeneration, postAudioGeneration } from '@/lib/api/generation'
import { nanoid } from 'nanoid'
import { cn } from '@/lib/utils'

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  preprocessing: 'Preparing',
  running: 'Generating',
  postprocessing: 'Finishing',
  persisting: 'Saving',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

interface Props {
  job: ActiveGenerationState
  workspaceId: string
  onClick?: () => void
}

export function GenerationCard({ job, workspaceId, onClick }: Props) {
  const store = useGenerationStore()
  const asset = job.assets[0]
  const isActive = !['completed', 'failed', 'cancelled'].includes(job.status)
  const [isFavorite, setIsFavorite] = useState(asset?.isFavorite ?? false)

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!asset) return
    setIsFavorite((v) => !v)
    try {
      const res = await patchFavorite(asset.id)
      setIsFavorite(res.is_favorite)
    } catch {
      setIsFavorite((v) => !v)
    }
  }

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteGenerationJob(job.jobId)
      store.cancelJob(job.jobId)
    } catch { /* ignore */ }
  }

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const ik = nanoid()
    store.setActiveJob({
      jobId: ik,
      mode: job.mode,
      prompt: job.prompt,
      status: 'queued',
      progress: 0,
      errorMessage: null,
      assets: [],
      createdAt: Date.now(),
    })
    try {
      if (job.mode === 'image') await postImageGeneration({ prompt: job.prompt }, ik)
      else if (job.mode === 'video') await postVideoGeneration({ prompt: job.prompt }, ik)
      else if (job.mode === 'audio') await postAudioGeneration({ prompt: job.prompt }, ik)
    } catch { /* handled by WS failure event */ }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'relative rounded-xl border overflow-hidden cursor-pointer group',
        'bg-[#0c0f1a] border-white/10',
        isActive && 'border-white/20',
      )}
    >
      {/* Thumbnail / active state */}
      {job.status === 'completed' && asset ? (
        <div className="aspect-square relative">
          {asset.type === 'image' && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={asset.storageKey}
              alt={job.prompt}
              className="w-full h-full object-cover"
            />
          )}
          {asset.type === 'video' && (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <span className="text-white/40 text-xs">▶ Video</span>
            </div>
          )}
          {asset.type === 'audio' && (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <div className="flex gap-0.5 items-end h-8">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-white/40 rounded-full"
                    style={{ height: `${6 + Math.abs(Math.sin(i * 0.7)) * 18}px` }}
                  />
                ))}
              </div>
            </div>
          )}
          {/* Hover actions */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2 gap-1.5">
            <button onClick={handleFavorite} className="p-1.5 rounded-full bg-black/60">
              <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white'}`} />
            </button>
            <a
              href={asset.storageKey}
              download={`aether-${asset.id}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full bg-black/60"
            >
              <Download className="w-3.5 h-3.5 text-white" />
            </a>
          </div>
        </div>
      ) : (
        <div className="aspect-square flex flex-col items-center justify-center gap-2 p-4">
          {isActive ? (
            <>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white/50 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${job.progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="text-white/50 text-xs">{STAGE_LABELS[job.status]}</p>
              <button onClick={handleCancel} className="mt-1">
                <X className="w-3.5 h-3.5 text-white/30 hover:text-white/60" />
              </button>
            </>
          ) : job.status === 'failed' ? (
            <>
              <p className="text-red-400/70 text-xs text-center line-clamp-2">{job.errorMessage ?? 'Failed'}</p>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </>
          ) : (
            <p className="text-white/30 text-xs">Cancelled</p>
          )}
        </div>
      )}

      {/* Prompt label */}
      <div className="px-2 py-1.5">
        <p className="text-white/40 text-xs truncate">{job.prompt}</p>
      </div>
    </motion.div>
  )
}
