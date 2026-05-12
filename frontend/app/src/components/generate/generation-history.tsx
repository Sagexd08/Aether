'use client'

import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { useGenerationStore } from '@/lib/store/generation'
import { getGenerationJobs } from '@/lib/api/generation'
import { QK } from '@/lib/api/query-keys'
import { GenerationCard } from './generation-card'
import type { GenerationMode } from '@aether/types'

const MODE_FILTERS: { value: GenerationMode | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
]

interface Props {
  workspaceId: string
}

export function GenerationHistory({ workspaceId }: Props) {
  const [modeFilter, setModeFilter] = useState<GenerationMode | 'all'>('all')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const store = useGenerationStore()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: QK.generations(workspaceId, modeFilter === 'all' ? undefined : modeFilter),
    queryFn: ({ pageParam }) =>
      getGenerationJobs(workspaceId, {
        mode: modeFilter === 'all' ? undefined : modeFilter,
        cursor: pageParam as string | undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const persistedJobs = data?.pages.flatMap((p) => p.jobs) ?? []
  const activeJobsList = Object.values(store.activeJobs)
    .filter((j) => ['queued', 'preprocessing', 'running', 'postprocessing', 'persisting'].includes(j.status))
    .filter((j) => modeFilter === 'all' || j.mode === modeFilter)
    .sort((a, b) => b.createdAt - a.createdAt)

  // Deduplicate: active jobs take precedence over persisted (same id)
  const activeIds = new Set(activeJobsList.map((j) => j.jobId))
  const filteredPersisted = persistedJobs.filter((j) => !activeIds.has(j.id))

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <div className="flex gap-2">
        {MODE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setModeFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              modeFilter === f.value
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/60 hover:bg-white/15'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <AnimatePresence initial={false}>
          {activeJobsList.map((job) => (
            <GenerationCard
              key={job.jobId}
              job={job}
              workspaceId={workspaceId}
              onClick={() => store.setFocusedJob(job.jobId)}
            />
          ))}
          {filteredPersisted.map((job) => {
            const active = store.activeJobs[job.id]
            const displayJob = active ?? {
              jobId: job.id,
              mode: job.mode,
              prompt: job.prompt,
              status: job.status,
              progress: job.progress,
              errorMessage: job.errorMessage,
              assets: job.assets,
              createdAt: new Date(job.createdAt).getTime(),
            }
            return (
              <GenerationCard
                key={job.id}
                job={displayJob}
                workspaceId={workspaceId}
                onClick={() => store.setFocusedJob(job.id)}
              />
            )
          })}
        </AnimatePresence>
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {isFetchingNextPage && (
        <p className="text-white/30 text-xs text-center">Loading more…</p>
      )}
    </div>
  )
}
