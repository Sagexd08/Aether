'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { Project } from '@aether/types'

const schema = z.object({
  name: z.string().min(2, 'At least 2 characters').max(120),
  description: z.string().max(2000).optional(),
  mode: z.enum(['multimodal', 'text', 'image', 'video']),
})

type Fields = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  onSubmit(data: { name: string; description?: string; mode: Project['mode'] }): Promise<void>
  error?: string | null
}

export function CreateProjectModal({ open, onOpenChange, onSubmit, error }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'multimodal' },
  })

  async function submit(data: Fields) {
    await onSubmit({ name: data.name, description: data.description, mode: data.mode })
    reset()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
          <div className="glass-panel rounded-[32px] p-8">
            <div className="mb-6 flex items-center justify-between">
              <Dialog.Title className="font-display text-2xl text-white">New project</Dialog.Title>
              <Dialog.Close className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit(submit)} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-white/70">Name *</label>
                <input
                  {...register('name')}
                  disabled={isSubmitting}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 disabled:opacity-50"
                  placeholder="My cinematic project"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-rose-300">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/70">Description</label>
                <textarea
                  {...register('description')}
                  disabled={isSubmitting}
                  rows={3}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 disabled:opacity-50"
                  placeholder="What are you building?"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/70">Mode</label>
                <select
                  {...register('mode')}
                  disabled={isSubmitting}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none disabled:opacity-50"
                >
                  <option value="multimodal">Multimodal</option>
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-rose-300"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:opacity-50"
              >
                {isSubmitting ? 'Creating…' : 'Create project'}
              </button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
