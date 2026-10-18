'use client'

import { useActionState } from 'react'
import { authenticate, type AuthState } from './actions'

// Dev convenience: pre-fill the local demo account. Unset in production, so
// the fields render empty there.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? ''
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? ''

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(authenticate, null)

  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <p className="font-display text-[0.6rem] tracking-[0.25em] text-accent uppercase">
        EatWagLove
      </p>
      <h1 className="font-display mt-2 text-3xl leading-tight text-balance">
        Someone is waiting for you.
      </h1>
      <p className="mt-3 text-ink-soft">
        Raise a pixel dog or cat, learn what its breed actually needs, and find out whether you
        remember to come back.
      </p>

      <form action={formAction} className="pixel-card mt-6 space-y-4 p-4">
        <label className="block">
          <span className="font-display text-[0.65rem] uppercase tracking-wide">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={DEMO_EMAIL}
            className="pixel-input mt-1"
          />
        </label>

        <label className="block">
          <span className="font-display text-[0.65rem] uppercase tracking-wide">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            defaultValue={DEMO_PASSWORD}
            className="pixel-input mt-1"
          />
        </label>

        {state?.error && (
          <p role="alert" className="text-alarm">
            {state.error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            name="intent"
            value="signin"
            disabled={pending}
            className="pixel-btn pixel-btn-primary flex-1"
          >
            {pending ? 'One moment…' : 'Sign in'}
          </button>
          <button type="submit" name="intent" value="signup" disabled={pending} className="pixel-btn flex-1">
            Create account
          </button>
        </div>
      </form>
    </main>
  )
}
