'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WSMessage, GenerationJob } from '@aether/types'
import { useGenerationStore } from '@/lib/store/generation'
import { useSessionStore } from '@/lib/store/session'
import { getInflightJobs } from '@/lib/api/generation'
import { QK } from '@/lib/api/query-keys'
import { toast } from '@/components/ui/toast'

export function useGenerationReconcile(lastEvent: WSMessage | null) {
  const store = useGenerationStore()
  const sessionStore = useSessionStore()
  const queryClient = useQueryClient()
  const reconciled = useRef(false)

  // On mount: fetch in-flight jobs and hydrate store
  useEffect(() => {
    if (reconciled.current || !sessionStore.sessionId) return
    reconciled.current = true

    getInflightJobs(sessionStore.sessionId).then((data) => {
      if (data.jobs.length > 0) {
        store.hydrateFromServer(data.jobs)
      }
    }).catch(() => {
      // non-fatal — store starts empty
    })
  }, [sessionStore.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wire WS events → store + query cache
  useEffect(() => {
    if (!lastEvent) return

    if (lastEvent.type === 'generation.progress') {
      store.updateProgress(
        lastEvent.jobId,
        lastEvent.payload.status,
        lastEvent.payload.progress,
      )
    }

    if (lastEvent.type === 'generation.completed') {
      const { job, assets } = lastEvent.payload
      store.completeJob(lastEvent.jobId, assets)

      // Optimistic prepend to gallery cache
      if (sessionStore.sessionId) {
        queryClient.setQueryData<{ pages: { jobs: GenerationJob[]; next_cursor: string | null }[] }>(
          QK.generations(sessionStore.sessionId),
          (old) => {
            if (!old) return old
            const firstPage = old.pages[0]
            if (!firstPage) return old
            const alreadyPresent = firstPage.jobs.some((j) => j.id === job.id)
            if (alreadyPresent) return old
            return {
              ...old,
              pages: [
                { ...firstPage, jobs: [job, ...firstPage.jobs] },
                ...old.pages.slice(1),
              ],
            }
          },
        )
      }

      toast.success('Generation complete — click to view')
    }

    if (lastEvent.type === 'generation.failed') {
      store.failJob(lastEvent.jobId, lastEvent.payload.error)
    }
  }, [lastEvent]) // eslint-disable-line react-hooks/exhaustive-deps
}