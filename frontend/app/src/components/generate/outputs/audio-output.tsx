'use client'

import { Download, Heart } from 'lucide-react'
import { useState } from 'react'
import type { ActiveGenerationState } from '@/lib/store/generation'
import { patchFavorite } from '@/lib/api/generation'

interface Props {
  job: ActiveGenerationState
}

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued…',
  preprocessing: 'Preparing…',
  running: 'Composing…',
  postprocessing: 'Finishing…',
  persisting: 'Saving…',
}

export function AudioOutput({ job }: Props) {
  const asset = job.assets[0]
  const [isFavorite, setIsFavorite] = useState(asset?.isFavorite ?? false)

  if (job.status !== 'completed' || !asset) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full">
        <div className="flex gap-1 items-end h-12">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-white/30 rounded-full animate-pulse"
              style={{
                height: `${20 + Math.sin(i * 0.8) * 18}px`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
        <p className="text-white/60 text-sm">{STAGE_LABELS[job.status] ?? job.status}</p>
        <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>
    )
  }

  const handleFavorite = async () => {
    setIsFavorite((v) => !v)
    try {
      const res = await patchFavorite(asset.id)
      setIsFavorite(res.is_favorite)
    } catch {
      setIsFavorite((v) => !v)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 h-full p-6">
      <div className="flex gap-1 items-end h-16">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="w-1 bg-white/50 rounded-full"
            style={{ height: `${10 + Math.abs(Math.sin(i * 0.5)) * 40}px` }}
          />
        ))}
      </div>
      <audio src={asset.storageKey} controls className="w-full max-w-sm" />
      <div className="flex gap-2">
        <button
          onClick={handleFavorite}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white/70'}`} />
        </button>
        <a
          href={asset.storageKey}
          download={`aether-${asset.id}.wav`}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Download className="w-4 h-4 text-white/70" />
        </a>
      </div>
    </div>
  )
}
