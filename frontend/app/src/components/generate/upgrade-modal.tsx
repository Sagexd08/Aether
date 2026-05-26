'use client'

import { useState } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import { useSessionStore } from '@/lib/store/session'

export function UpgradeModal() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const generationsRemaining = useSessionStore((s) => s.generationsRemaining)

  if (generationsRemaining > 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#0c0f1a] border border-white/20 rounded-3xl p-8 max-w-md w-full shadow-2xl shadow-white/5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">You&apos;ve reached the limit</h2>
              <p className="text-white/60 text-sm">But your journey doesn&apos;t have to end.</p>
            </div>
          </div>
        </div>

        {isSuccess ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">You&apos;re on the list</h3>
            <p className="text-white/60 text-sm">We&apos;ll let you know as soon as early access opens.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-white/70 text-sm leading-relaxed">
              Join our early access waitlist to unlock unlimited generations, exclusive features, and priority support.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!email) return
                setIsSubmitting(true)
                await new Promise((r) => setTimeout(r, 800))
                setIsSuccess(true)
                setIsSubmitting(false)
              }}
              className="space-y-4"
            >
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 rounded-xl text-sm hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <span>Joining…</span>
                ) : (
                  <>
                    <span>Continue the Journey</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}