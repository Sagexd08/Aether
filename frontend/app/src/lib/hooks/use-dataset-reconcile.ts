'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Dataset, WSMessage } from '@aether/types'
import { useDatasetStore } from '@/lib/store/dataset'
import { getInflightDatasets } from '@/lib/api/datasets'
import { QK } from '@/lib/api/query-keys'
import { toast } from '@/components/ui/toast'

export function useDatasetReconcile(
  workspaceId: string,
  lastEvent: WSMessage | null,
) {
  const store = useDatasetStore()
  const queryClient = useQueryClient()
  const reconciled = useRef(false)

  // On mount: fetch in-flight datasets and hydrate store
  useEffect(() => {
    if (reconciled.current || !workspaceId) return
    reconciled.current = true
    getInflightDatasets(workspaceId)
      .then((datasets) => {
        if (datasets.length > 0) store.hydrateFromServer(datasets)
      })
      .catch(() => {
        // non-fatal
      })
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wire WS events → store + query cache
  useEffect(() => {
    if (!lastEvent) return

    if (lastEvent.type === 'dataset.progress') {
      store.updateProgress(
        lastEvent.datasetId,
        lastEvent.payload.status,
        lastEvent.payload.progress,
      )
    }

    if (lastEvent.type === 'dataset.completed') {
      const { dataset } = lastEvent.payload
      store.completeIngestion(lastEvent.datasetId)

      // Prepend to datasets list cache
      queryClient.setQueryData<Dataset[]>(
        QK.datasets(workspaceId),
        (old) => {
          if (!old) return [dataset]
          const alreadyPresent = old.some((d) => d.id === dataset.id)
          if (alreadyPresent) return old.map((d) => (d.id === dataset.id ? dataset : d))
          return [dataset, ...old]
        },
      )

      toast.success(`Dataset "${dataset.name}" ingested successfully`)
    }

    if (lastEvent.type === 'dataset.failed') {
      store.failIngestion(lastEvent.datasetId, lastEvent.payload.error)
      toast.error(`Dataset ingestion failed: ${lastEvent.payload.error}`)
    }
  }, [lastEvent]) // eslint-disable-line react-hooks/exhaustive-deps
}
