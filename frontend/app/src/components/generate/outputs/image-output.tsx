'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Heart, Loader2 } from 'lucide-react'
import type { ActiveGenerationState } from '@/lib/store/generation'
import { patchFavorite } from '@/lib/api/generation'

interface Props {
  job: ActiveGenerationState
}

export function ImageOutput({ job }: Props) {
  const asset = job.assets[0]
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [retries, setRetries] = useState(0)
  const [isFavorite, setIsFavorite] = useState(asset?.isFavorite ?? false)

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    )
  }

  const handleError = () => {
    if (retries < 3) {
      setTimeout(() => setRetries((r) => r + 1), 1000)
    } else {
      setImgError(true)
    }
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

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = asset.storageKey
    a.download = `aether-${asset.id}.png`
    a.click()
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {!imgLoaded && !imgError && (
        <div className="absolute inset-0 skeleton-shimmer rounded-xl" />
      )}
      {imgError ? (
        <p className="text-white/40 text-sm">Failed to load image</p>
      ) : (
        <AnimatePresence>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img
            key={`${asset.id}-${retries}`}
            src={asset.storageKey}
            alt={job.prompt}
            className="max-w-full max-h-full rounded-xl object-contain"
            initial={{ opacity: 0 }}
            animate={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
            onError={handleError}
          />
        </AnimatePresence>
      )}

      {imgLoaded && (
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button
            onClick={handleFavorite}
            className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white/70'}`} />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
          >
            <Download className="w-4 h-4 text-white/70" />
          </button>
        </div>
      )}
    </div>
  )
}
