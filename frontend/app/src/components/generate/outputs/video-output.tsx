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
  running: 'Generating…',
  postprocessing: 'Finishing…',
  persisting: 'Saving…',
}

export function VideoOutput({ job }: Props) {
  const asset = job.assets[0]
  const [isFavorite, setIsFavorite] = useState(asset?.isFavorite ?? false)

  if (job.status !== 'completed' || !asset) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full">
        <p className="text-white/60 text-sm font-medium">
          {STAGE_LABELS[job.status] ?? job.status}
        </p>
        <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <p className="text-white/30 text-xs">{job.progress}%</p>
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
    <div className="relative w-full h-full flex items-center justify-center">
      <video
        src={asset.storageKey}
        className="max-w-full max-h-full rounded-xl"
        controls
        autoPlay
        loop
      />
      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          onClick={handleFavorite}
          className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white/70'}`} />
        </button>
        <a
          href={asset.storageKey}
          download={`aether-${asset.id}.mp4`}
          className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
        >
          <Download className="w-4 h-4 text-white/70" />
        </a>
      </div>
    </div>
  )
}
