'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { Loader2, Sparkles } from 'lucide-react'
import type { GenerationMode } from '@aether/types'
import { useGenerationStore } from '@/lib/store/generation'
import { useQueryClient } from '@tanstack/react-query'
import { postImageGeneration, postVideoGeneration, postAudioGeneration } from '@/lib/api/generation'
import { QK } from '@/lib/api/query-keys'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const MODES: { value: GenerationMode; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
]

const schema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000),
  negativePrompt: z.string().max(1000).optional(),
  seed: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ControlsPanelProps {
  workspaceId: string
}

export function ControlsPanel({ workspaceId }: ControlsPanelProps) {
  const [mode, setMode] = useState<GenerationMode>('image')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const store = useGenerationStore()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    if (mode === 'text') return  // coming soon
    if (!workspaceId) return

    const idempotencyKey = nanoid()
    const seed = values.seed ? parseInt(values.seed, 10) : undefined
    const req = {
      prompt: values.prompt,
      negativePrompt: values.negativePrompt || undefined,
      seed: isNaN(seed!) ? undefined : seed,
    }

    // Optimistic active job
    store.setActiveJob({
      jobId: idempotencyKey,  // temp ID until real job_id returns
      mode,
      prompt: values.prompt,
      status: 'queued',
      progress: 0,
      errorMessage: null,
      assets: [],
      createdAt: Date.now(),
    })

    try {
      if (mode === 'image') {
        const result = await postImageGeneration(req, idempotencyKey)
        store.setActiveJob({
          jobId: result.job.id,
          mode,
          prompt: values.prompt,
          status: 'completed',
          progress: 100,
          errorMessage: null,
          assets: result.job.assets,
          createdAt: Date.now(),
        })
        queryClient.invalidateQueries({ queryKey: QK.generations(workspaceId) })
      } else if (mode === 'video') {
        const result = await postVideoGeneration(req, idempotencyKey)
        store.setActiveJob({
          jobId: result.job_id,
          mode,
          prompt: values.prompt,
          status: 'queued',
          progress: 0,
          errorMessage: null,
          assets: [],
          createdAt: Date.now(),
        })
      } else if (mode === 'audio') {
        const result = await postAudioGeneration(req, idempotencyKey)
        store.setActiveJob({
          jobId: result.job_id,
          mode,
          prompt: values.prompt,
          status: 'queued',
          progress: 0,
          errorMessage: null,
          assets: [],
          createdAt: Date.now(),
        })
      }
    } catch (err) {
      store.failJob(idempotencyKey, err instanceof ApiError ? err.message : 'Generation failed')
      if (err instanceof ApiError && err.status === 402) {
        toast.error('Not enough credits')
      } else {
        toast.error('Generation failed — please try again')
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              mode === m.value
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/70 hover:bg-white/15',
              m.value === 'text' && 'opacity-50 cursor-not-allowed',
            )}
            disabled={m.value === 'text'}
            title={m.value === 'text' ? 'Coming in next sprint' : undefined}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 flex-1">
        {/* Prompt */}
        <div className="flex flex-col gap-1">
          <textarea
            {...register('prompt')}
            placeholder="Describe the scene…"
            rows={5}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none"
          />
          {errors.prompt && (
            <p className="text-red-400 text-xs">{errors.prompt.message}</p>
          )}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-white/40 hover:text-white/60 text-left"
        >
          {showAdvanced ? '▲ Hide' : '▼ Advanced'}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Negative prompt</label>
              <input
                {...register('negativePrompt')}
                placeholder="What to avoid…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Seed (optional)</label>
              <input
                {...register('seed')}
                type="number"
                placeholder="Random"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
          </div>
        )}

        <div className="mt-auto">
          <button
            type="submit"
            disabled={isSubmitting || mode === 'text'}
            className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 rounded-full text-sm hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isSubmitting ? 'Generating…' : '✦ Generate'}
          </button>
        </div>
      </form>
    </div>
  )
}
