import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4'

const NAV_ITEMS = ['Home', 'Studio', 'About', 'Journal', 'Reach Us'] as const

export default function Landing() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const FADE = 0.5

    function tick() {
      if (!video) return
      const { currentTime, duration } = video
      if (currentTime < FADE) {
        video.style.opacity = String(currentTime / FADE)
      } else if (duration && currentTime > duration - FADE) {
        video.style.opacity = String((duration - currentTime) / FADE)
      } else {
        video.style.opacity = '1'
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    function handleEnded() {
      if (!video) return
      video.style.opacity = '0'
      setTimeout(() => {
        if (!video) return
        video.currentTime = 0
        video.play().catch(() => {})
      }, 100)
    }

    video.style.opacity = '0'
    rafRef.current = requestAnimationFrame(tick)
    video.addEventListener('ended', handleEnded)

    return () => {
      cancelAnimationFrame(rafRef.current)
      video.removeEventListener('ended', handleEnded)
    }
  }, [])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white">
      {/* Video layer */}
      <div className="absolute inset-x-0 bottom-0 z-0" style={{ top: '300px' }}>
        <video
          ref={videoRef}
          src={VIDEO_URL}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
          style={{ transition: 'opacity 0.1s linear' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-white" />
      </div>

      {/* Nav */}
      <nav className="relative z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
          <span
            className="text-3xl tracking-tight"
            style={{ fontFamily: "'Instrument Serif', serif", color: '#000000' }}
          >
            Aether<sup style={{ fontSize: '0.55em', verticalAlign: 'super' }}>®</sup>
          </span>

          <ul className="hidden items-center gap-8 md:flex" style={{ fontFamily: "'Inter', sans-serif" }}>
            {NAV_ITEMS.map((item) => (
              <li key={item}>
                <a
                  href="#"
                  className="text-sm transition-colors duration-200 hover:text-black/70"
                  style={{ color: item === 'Home' ? '#000000' : '#6F6F6F' }}
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>

          <button
            onClick={() => {}}
            className="rounded-full px-6 py-2.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.03]"
            style={{ backgroundColor: '#000000', fontFamily: "'Inter', sans-serif" }}
          >
            Begin Journey
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section
        className="relative z-10 flex flex-col items-center justify-center px-6 pb-40 text-center"
        style={{ paddingTop: 'calc(8rem - 75px)' }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="max-w-7xl text-5xl font-normal sm:text-7xl md:text-8xl"
          style={{
            fontFamily: "'Instrument Serif', serif",
            lineHeight: 0.95,
            letterSpacing: '-2.46px',
            color: '#000000',
          }}
        >
          Beyond{' '}
          <em style={{ color: '#6F6F6F', fontStyle: 'italic' }}>silence,</em>
          {' '}we build{' '}
          <em style={{ color: '#6F6F6F', fontStyle: 'italic' }}>the eternal.</em>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          className="mt-8 max-w-2xl text-base leading-relaxed sm:text-lg"
          style={{ color: '#6F6F6F', fontFamily: "'Inter', sans-serif" }}
        >
          Building platforms for brilliant minds, fearless makers, and thoughtful souls.
          Through the noise, we craft digital havens for deep work and pure flows.
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
          onClick={() => {}}
          className="mt-12 rounded-full px-14 py-5 text-base font-medium text-white transition-transform duration-200 hover:scale-[1.03]"
          style={{ backgroundColor: '#000000', fontFamily: "'Inter', sans-serif" }}
        >
          Begin Journey
        </motion.button>
      </section>
    </div>
  )
}
