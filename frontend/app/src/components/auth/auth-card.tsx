import Link from 'next/link'
import type { Route } from 'next'

export function AuthCard({
  title,
  description,
  footer,
}: {
  title: string
  description: string
  footer: React.ReactNode
}) {
  return (
    <div className="glass-panel glow-ring w-full max-w-md rounded-[32px] p-8 md:p-10">
      <div className="mb-8">
        <div className="font-display text-3xl tracking-tight text-white">AETHER</div>
        <h1 className="mt-6 font-display text-4xl leading-tight text-white">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-white/60">{description}</p>
      </div>
      <div className="space-y-4">
        <label className="block text-sm text-white/70">
          <span className="mb-2 block">Email</span>
          <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 focus:bg-white/8" placeholder="you@aether.ai" />
        </label>
        <label className="block text-sm text-white/70">
          <span className="mb-2 block">Password</span>
          <input type="password" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#a78bfa]/40 focus:bg-white/8" placeholder="••••••••" />
        </label>
        <button className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01]">Continue</button>
      </div>
      <div className="mt-6 flex items-center gap-3 text-xs text-white/45">
        <div className="h-px flex-1 bg-white/10" />
        <span>or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">Google</button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">GitHub</button>
      </div>
      <div className="mt-6 text-sm text-white/55">{footer}</div>
    </div>
  )
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,179,237,0.18),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.18),transparent_24%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="relative z-10 w-full">{children}</div>
    </main>
  )
}

export function AuthFooterLink({ href, label, linkText }: { href: Route; label: string; linkText: string }) {
  return (
    <p>
      {label}{' '}
      <Link href={href} className="text-white transition hover:text-[#63b3ed]">
        {linkText}
      </Link>
    </p>
  )
}
