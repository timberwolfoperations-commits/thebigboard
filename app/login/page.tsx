'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-950">
      {/* Logo / title */}
      <div className="mb-10 text-center">
        <h1
          className="text-4xl font-bold tracking-tight text-zinc-100 mb-2"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          The Big Board
        </h1>
        <p className="text-sm text-zinc-500">Premium tournament bracket pools</p>
      </div>

      <div className="w-full max-w-sm">
        {sent ? (
          /* ── Success state ── */
          <div className="rounded-2xl border border-emerald-700/40 bg-emerald-500/10 p-8 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40 mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-400"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-emerald-300 mb-1">
              Check your email
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              We sent a magic link to{' '}
              <span className="text-zinc-200 font-medium">{email}</span>.
              Tap the link to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="mt-5 text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-4 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* ── Input form ── */
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 flex flex-col gap-4"
          >
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold text-sm py-3 transition-colors mt-1 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                'Send Magic Link'
              )}
            </button>

            <p className="text-center text-[11px] text-zinc-600 mt-1">
              No password needed. We'll email you a secure link.
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
