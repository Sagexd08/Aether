'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { Route } from 'next'
import {
  Bell, Bot, BrainCircuit, FolderKanban, GalleryVerticalEnd,
  LayoutDashboard, LogOut, PanelsTopLeft, Settings2, Sparkles, Video, Volume2, Wallet,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/store/auth'
import { useAppShellStore } from '@/lib/store/app-shell'
import { useWorkspaceWebSocket } from '@/lib/hooks/use-websocket'
import { apiRequest } from '@/lib/api/client'
import { QK } from '@/lib/api/query-keys'
import { SkeletonAvatar, SkeletonBlock } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
  { href: '/workspace', label: 'Workspace', icon: LayoutDashboard },
  { href: '/generate', label: 'Generate', icon: Sparkles },
  { href: '/gallery', label: 'Gallery', icon: GalleryVerticalEnd },
  { href: '/video', label: 'Video', icon: Video },
  { href: '/audio', label: 'Audio', icon: Volume2 },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/workflows', label: 'Workflows', icon: PanelsTopLeft },
  { href: '/datasets', label: 'Datasets', icon: FolderKanban },
  { href: '/training', label: 'Training', icon: BrainCircuit },
  { href: '/models', label: 'Models', icon: Bot },
  { href: '/billing', label: 'Billing', icon: Wallet },
  { href: '/settings', label: 'Settings', icon: Settings2 },
]

interface RawNotification {
  id: string
  workspace_id: string
  kind: string
  title: string
  body: string
  status: string
  created_at: string
}

export function WorkspaceShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  const { user, workspace, status, signOut } = useAuthStore()
  const { navCollapsed, toggleNav } = useAppShellStore()
  const pathname = usePathname()
  const router = useRouter()

  const wsHook = useWorkspaceWebSocket(workspace?.id ?? '')

  const notifications = useQuery({
    queryKey: QK.notifications(workspace?.id ?? ''),
    queryFn: () =>
      apiRequest<RawNotification[]>(`/api/notifications?workspace_id=${workspace?.id}`),
    enabled: !!workspace?.id,
    staleTime: 0,
  })

  const unreadCount = notifications.data?.filter((n) => n.status === 'unread').length ?? 0
  const isLoading = status === 'loading'

  async function handleSignOut() {
    await signOut()
    router.push('/signin')
  }

  return (
    <main className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[auto_minmax(0,1fr)_320px]">

        {/* Nav Rail */}
        <aside className={cn('glass-panel rounded-[30px] p-4 transition-all duration-300', navCollapsed ? 'w-[92px]' : 'w-[280px]')}>
          <div className="mb-6 flex items-center justify-between">
            <div className={cn('font-display text-2xl text-white transition-opacity', navCollapsed && 'opacity-0')}>
              AETHER
            </div>
            <button
              onClick={toggleNav}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10"
            >
              {navCollapsed ? 'Open' : 'Fold'}
            </button>
          </div>

          {/* User info */}
          <div className={cn('mb-5 flex items-center gap-3', navCollapsed && 'justify-center')}>
            {isLoading ? (
              <SkeletonAvatar size={32} />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#63b3ed] to-[#a78bfa] text-xs font-semibold text-black">
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            {!navCollapsed && (
              <div className="min-w-0">
                {isLoading ? (
                  <SkeletonBlock className="h-3 w-24" />
                ) : (
                  <p className="truncate text-sm text-white/80">{user?.name}</p>
                )}
              </div>
            )}
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href as Route}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/65 transition hover:bg-white/6 hover:text-white',
                  pathname === href && 'glow-ring bg-white/7 text-white',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn('transition-opacity', navCollapsed && 'hidden')}>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-4 border-t border-white/8 pt-4">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/50 transition hover:bg-white/6 hover:text-white/80"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={cn(navCollapsed && 'hidden')}>Sign out</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <section className="glass-panel rounded-[30px] p-5 md:p-6">
          <div className="mb-6 flex flex-col gap-4 border-b border-white/8 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/45">
                {isLoading ? '—' : (workspace?.name ?? 'AETHER workspace')}
              </p>
              <h1 className="mt-2 font-display text-4xl text-white">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/55">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              {isLoading ? (
                <SkeletonBlock className="h-9 w-28 rounded-full" />
              ) : (
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">
                  {(user?.creditsRemaining ?? 0).toLocaleString()} credits
                </div>
              )}
              <div className="relative">
                <button className="rounded-full border border-white/10 bg-white/5 p-3 text-white/75 transition hover:bg-white/10">
                  <Bell className="h-4 w-4" />
                </button>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#63b3ed] text-[9px] font-bold text-black">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          {children}
        </section>

        {/* Inspector */}
        <aside className="glass-panel rounded-[30px] p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-white/45">Inspector</div>
          <h2 className="font-display text-2xl text-white">AI context</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="text-sm text-white/80">Current mode</div>
              <div className="mt-2 text-xs leading-6 text-white/50">
                Text generation with enhancement enabled, streaming on completion, workspace memory active.
              </div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    wsHook.status === 'connected'
                      ? 'bg-emerald-400'
                      : wsHook.status === 'connecting'
                        ? 'animate-pulse bg-amber-400'
                        : 'bg-rose-400',
                  )}
                />
                Live system
              </div>
              <div className="mt-2 text-xs leading-6 text-white/50">
                {wsHook.status === 'connected' && 'Realtime channel active.'}
                {wsHook.status === 'connecting' && 'Connecting to realtime channel…'}
                {wsHook.status === 'disconnected' && 'Connection lost. Reload to reconnect.'}
                {wsHook.lastEvent && (
                  <span className="mt-1 block text-white/30">Last: {wsHook.lastEvent.type}</span>
                )}
              </div>
            </div>
          </div>
        </aside>

      </div>
    </main>
  )
}
