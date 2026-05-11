'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, Info, TriangleAlert, XCircle } from 'lucide-react'
import { useEffect } from 'react'
import { create } from 'zustand'

type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
  duration: number
}

interface ToastStore {
  items: ToastItem[]
  add(item: Omit<ToastItem, 'id'>): void
  remove(id: string): void
}

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  add: (item) =>
    set((state) => ({
      items: [...state.items, { ...item, id: crypto.randomUUID() }],
    })),
  remove: (id) =>
    set((state) => ({ items: state.items.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().add({ kind: 'success', message, duration: options?.duration ?? 4000 }),
  error: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().add({ kind: 'error', message, duration: options?.duration ?? 5000 }),
  info: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().add({ kind: 'info', message, duration: options?.duration ?? 4000 }),
  warning: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().add({ kind: 'warning', message, duration: options?.duration ?? 4000 }),
}

const ICONS: Record<ToastKind, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: TriangleAlert,
}

const COLORS: Record<ToastKind, string> = {
  success: 'text-emerald-400 border-emerald-400/20',
  error: 'text-rose-400 border-rose-400/20',
  info: 'text-[#63b3ed] border-[#63b3ed]/20',
  warning: 'text-amber-400 border-amber-400/20',
}

function ToastItem({ item }: { item: ToastItem }) {
  const remove = useToastStore((s) => s.remove)
  const Icon = ICONS[item.kind]

  useEffect(() => {
    const timer = setTimeout(() => remove(item.id), item.duration)
    return () => clearTimeout(timer)
  }, [item.id, item.duration, remove])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${COLORS[item.kind]}`}
      style={{
        background: 'rgba(12, 15, 26, 0.92)',
        backdropFilter: 'blur(22px)',
        boxShadow: '0 8px 32px rgba(2,6,23,0.5)',
      }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-white/90">{item.message}</span>
      <button
        onClick={() => remove(item.id)}
        className="ml-auto text-white/40 transition hover:text-white/80"
      >
        ×
      </button>
    </motion.div>
  )
}

export function ToastRegion() {
  const items = useToastStore((s) => s.items)

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex w-80 flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastItem item={item} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
