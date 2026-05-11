'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AnimatePresence, motion } from 'framer-motion'
import type { Route } from 'next'
import { signIn, signUp } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/store/auth'
import { listWorkspaces } from '@/lib/api/workspaces'

const signUpSchema = z.object({
  name: z.string().min(2, 'At least 2 characters').max(80),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[0-9!@#$%^&*]/, 'Include at least one number or symbol'),
})

const signInSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Required'),
})

type SignUpFields = z.infer<typeof signUpSchema>
type SignInFields = z.infer<typeof signInSchema>

function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9!@#$%^&*]/.test(password)) score++
  return score as 0 | 1 | 2 | 3
}

const STRENGTH_COLORS = ['bg-rose-500', 'bg-amber-400', 'bg-emerald-400']
const STRENGTH_LABELS = ['Weak', 'Fair', 'Strong']

export function AuthCard({
  title,
  description,
  footer,
  mode = 'signin',
}: {
  title: string
  description: string
  footer: React.ReactNode
  mode?: 'signin' | 'signup'
}) {
  const router = useRouter()
  const { setAuth, setWorkspace } = useAuthStore()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<SignUpFields | SignInFields>({
    resolver: zodResolver(mode === 'signup' ? signUpSchema : signInSchema),
  })

  const password = watch('password') ?? ''
  const strength = mode === 'signup' ? passwordStrength(password) : 0

  async function onSubmit(data: SignUpFields | SignInFields) {
    try {
      const result =
        mode === 'signup'
          ? await signUp(data as SignUpFields)
          : await signIn(data as SignInFields)

      setAuth(result.token, result.user)

      const workspaces = await listWorkspaces()
      if (workspaces.length > 0) setWorkspace(workspaces[0])

      const params = new URLSearchParams(window.location.search)
      router.push((params.get('next') ?? '/workspace') as Route)
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Authentication failed',
      })
    }
  }

  return (
    <div className="glass-panel glow-ring w-full max-w-md rounded-[32px] p-8 md:p-10">
      <div className="mb-8">
        <div className="font-display text-3xl tracking-tight text-white">AETHER</div>
        <h1 className="mt-6 font-display text-4xl leading-tight text-white">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-white/60">{description}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label className="mb-2 block text-sm text-white/70">Name</label>
            <input
              {...register('name')}
              disabled={isSubmitting}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 focus:bg-white/8 disabled:opacity-50"
              placeholder="Sage"
            />
            <AnimatePresence>
              {'name' in errors && errors.name && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-1 text-xs text-rose-300"
                >
                  {errors.name.message}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm text-white/70">Email</label>
          <input
            {...register('email')}
            type="email"
            disabled={isSubmitting}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 focus:bg-white/8 disabled:opacity-50"
            placeholder="you@aether.ai"
          />
          <AnimatePresence>
            {errors.email && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 text-xs text-rose-300"
              >
                {errors.email.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div>
          <label className="mb-2 block text-sm text-white/70">Password</label>
          <input
            {...register('password')}
            type="password"
            disabled={isSubmitting}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#a78bfa]/40 focus:bg-white/8 disabled:opacity-50"
            placeholder="••••••••"
          />
          {mode === 'signup' && password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? STRENGTH_COLORS[strength - 1] : 'bg-white/10'}`}
                  />
                ))}
              </div>
              {strength > 0 && (
                <p className="text-xs text-white/40">{STRENGTH_LABELS[strength - 1]}</p>
              )}
            </div>
          )}
          <AnimatePresence>
            {errors.password && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 text-xs text-rose-300"
              >
                {errors.password.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:opacity-50"
        >
          {isSubmitting ? 'Securing session…' : 'Continue'}
        </button>

        <AnimatePresence>
          {errors.root && (
            <motion.p
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-rose-300"
            >
              {errors.root.message}
            </motion.p>
          )}
        </AnimatePresence>
      </form>

      <div className="mt-6 flex items-center gap-3 text-xs text-white/45">
        <div className="h-px flex-1 bg-white/10" />
        <span>or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button disabled className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/40" title="Coming soon">
          Google
        </button>
        <button disabled className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/40" title="Coming soon">
          GitHub
        </button>
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
