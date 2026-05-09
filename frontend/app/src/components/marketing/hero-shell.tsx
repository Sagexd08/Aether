import Link from 'next/link'

export function HeroShell() {
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,179,237,0.24),transparent_22%),radial-gradient(circle_at_top_right,rgba(167,139,250,0.2),transparent_26%),linear-gradient(180deg,#020305_0%,#060810_50%,#0c0f1a_100%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:64px_64px]" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-8">
        <div className="font-display text-3xl tracking-tight">AETHER</div>
        <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
          <Link href="#studio">Studio</Link>
          <Link href="#agents">Agents</Link>
          <Link href="#workflows">Workflows</Link>
          <Link href="#pricing">Pricing</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/signin" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-white/10">Sign In</Link>
          <Link href="/signup" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.02]">Launch Workspace</Link>
        </div>
      </header>
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-7xl flex-col justify-center px-6 pb-20 pt-10 md:px-8">
        <div className="fade-rise max-w-4xl">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/60 glass-panel">
            Multimodal creative operating system
          </div>
          <h1 className="font-display text-5xl leading-[0.94] tracking-[-0.05em] md:text-7xl">
            Design, direct, and deploy generative media from one cinematic control room.
          </h1>
          <p className="fade-rise-delay mt-8 max-w-2xl text-base leading-8 text-white/66 md:text-lg">
            AETHER AI unifies text, image, video, audio, agents, and workflows inside a luxury-grade interface built for creators who want velocity without sacrificing taste.
          </p>
          <div className="fade-rise-delay-2 mt-10 flex flex-wrap items-center gap-4">
            <Link href="/signup" className="rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:scale-[1.03]">Begin Journey</Link>
            <Link href="/workspace" className="rounded-full border border-white/10 bg-white/5 px-7 py-3 text-sm text-white/80 transition hover:bg-white/10">Preview Workspace</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
