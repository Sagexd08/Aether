'use client'

import { Sparkles, Upload, WandSparkles } from 'lucide-react'
import { useAppShellStore } from '@/lib/store/app-shell'
import type { GenerationMode } from '@aether/types'
import { cn } from '@/lib/utils'

const modes: GenerationMode[] = ['text', 'image', 'video', 'audio']

export function CommandBar() {
  const { activeMode, setActiveMode } = useAppShellStore()

  return (
    <div className="glass-panel rounded-[28px] p-4 md:p-5">
      <div className="flex flex-wrap gap-2">
        {modes.map((mode) => (
          <button key={mode} onClick={() => setActiveMode(mode)} className={cn('rounded-full px-4 py-2 text-sm capitalize transition', activeMode === mode ? 'bg-white text-black' : 'bg-white/5 text-white/65 hover:bg-white/10 hover:text-white')}>
            {mode}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <textarea rows={6} className="w-full resize-none bg-transparent text-sm leading-7 text-white/80 outline-none placeholder:text-white/30" placeholder="Describe the shot, structure the scene, attach references, and direct the AI like a creative lead…" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Enhance prompt</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Negative prompt</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Mood controls</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-full border border-white/10 bg-white/5 p-3 text-white/70 transition hover:bg-white/10"><Upload className="h-4 w-4" /></button>
            <button className="rounded-full border border-white/10 bg-white/5 p-3 text-white/70 transition hover:bg-white/10"><WandSparkles className="h-4 w-4" /></button>
            <button className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02]">
              <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" /> Generate</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
