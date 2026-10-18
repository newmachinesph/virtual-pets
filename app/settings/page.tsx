import { redirect } from 'next/navigation'
import { signOut } from '@/app/login/actions'
import PushOptIn from '@/components/PushOptIn'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import SettingsForm from './SettingsForm'

export const metadata = { title: 'Settings — EatWagLove Pet' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = data as Profile | null
  if (!profile) {
    return (
      <main className="px-4 py-10">
        <p role="alert" className="text-alarm">
          Your profile could not be loaded. Try refreshing.
        </p>
      </main>
    )
  }

  return (
    <main className="px-4 py-4">
      <h1 className="font-display text-xl text-ink">Settings</h1>

      <section aria-labelledby="push-device" className="pixel-card mt-4 p-4">
        <h2 id="push-device" className="font-display text-sm uppercase tracking-wide text-ink">
          Push on this device
        </h2>
        <p className="mt-1 mb-3 text-ink-soft">
          Your pet can nudge you here even when the tab is closed.
        </p>
        <PushOptIn />
      </section>

      <section aria-labelledby="preferences" className="pixel-card mt-4 p-4">
        <h2 id="preferences" className="mb-4 font-display text-sm uppercase tracking-wide text-ink">
          Preferences
        </h2>
        <SettingsForm profile={profile} />
      </section>

      <form action={signOut} className="mt-4">
        <button type="submit" className="pixel-btn w-full">
          Sign out
        </button>
      </form>
    </main>
  )
}
