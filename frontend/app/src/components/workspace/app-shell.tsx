'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { Bell, Bot, FolderKanban, GalleryVerticalEnd, LayoutDashboard, PanelsTopLeft, Settings2, Sparkles, Video, Volume2, Wallet } from 'lucide-react'
import { useAppShellStore } from '@/lib/store/app-shell'
import { cn } from '@/lib/utils'

const items: { href: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { href: '/workspace', label: 'Workspace', icon: LayoutDashboard },
  { href: '/generate', label: 'Generate', icon: Sparkles },
  { href: '/gallery', label: 'Gallery', icon: GalleryVerticalEnd },
  { href: '/video', label: 'Video', icon: Video },
  { href: '/audio', label: 'Audio', icon: Volume2 },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/workflows', label: 'Workflows', icon: PanelsTopLeft },
  { href: '/datasets', label: 'Datasets', icon: FolderKanban },
  { href: '/billing', label: 'Billing', icon: Wallet },
  { href: '/settings', label: 'Settings', icon: Settings2 },
]

export function WorkspaceShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { navCollapsed, toggleNav } = useAppShellStore()

  return (
    <main className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[auto_minmax(0,1fr)_320px]">
        <aside className={cn('glass-panel rounded-[30px] p-4 transition-all duration-300', navCollapsed ? 'w-[92px]' : 'w-[280px]')}>
          <div className="mb-6 flex items-center justify-between">
            <div className={cn('font-display text-2xl text-white transition-opacity', navCollapsed && 'opacity-0')}>AETHER</div>
            <button onClick={toggleNav} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10">{navCollapsed ? 'Open' : 'Fold'}</button>
          </div>
          <nav className="space-y-2">
            {items.map(({ href, label, icon: Icon }, index) => (
              <Link key={href} href={href} className={cn('group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/65 transition hover:bg-white/6 hover:text-white', index === 0 && 'glow-ring bg-white/7 text-white')}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn('transition-opacity', navCollapsed && 'hidden')}>{label}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <section className="glass-panel rounded-[30px] p-5 md:p-6">
          <div className="mb-6 flex flex-col gap-4 border-b border-white/8 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/45">AETHER workspace</p>
              <h1 className="mt-2 font-display text-4xl text-white">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/55">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">1,280 credits</div>
              <button className="rounded-full border border-white/10 bg-white/5 p-3 text-white/75 transition hover:bg-white/10"><Bell className="h-4 w-4" /></button>
            </div>
          </div>
          {children}
        </section>
        <aside className="glass-panel rounded-[30px] p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-white/45">Inspector</div>
          <h2 className="font-display text-2xl text-white">AI context</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="text-sm text-white/80">Current mode</div>
              <div className="mt-2 text-xs leading-6 text-white/50">Text generation with enhancement enabled, streaming on completion, workspace memory active.</div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="text-sm text-white/80">Live system</div>
              <div className="mt-2 text-xs leading-6 text-white/50">Realtime notifications, queue status, and generation routing will appear here.</div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
