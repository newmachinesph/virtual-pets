import { redirect } from 'next/navigation'
import NotificationFeed from '@/components/NotificationFeed'
import { createClient } from '@/lib/supabase/server'
import type { Achievement } from '@/lib/types'

export const metadata = { title: 'Journal — EatWagLove Pet' }

export default async function JournalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pet } = await supabase.from('pets').select('name, species, breed').limit(1).maybeSingle()
  if (!pet) redirect('/create')

  const [achievementsRes, unlockedRes, feedRes, breedRes, linksRes] = await Promise.all([
    supabase.from('achievements').select('*'),
    supabase.from('user_achievements').select('achievement_key'),
    supabase.from('notifications_log').select('id, type, message, read_at, created_at')
      .eq('channel', 'in_app').order('created_at', { ascending: false }).limit(20),
    supabase.from('breeds').select('care_notes').eq('species', pet.species).eq('name', pet.breed).single(),
    supabase.from('content_links').select('situation, title, url').in('situation', ['breed', 'video']),
  ])

  const unlocked = (unlockedRes.data ?? []).map((row) => row.achievement_key)
  const achievements = (achievementsRes.data ?? []) as Achievement[]

  return (
    <main className="px-4 py-4">
      <h1 className="font-display text-xl">Journal</h1>

      <section aria-labelledby="messages" className="pixel-card mt-3 p-3">
        <h2 id="messages" className="font-display text-[0.7rem] uppercase tracking-wide">
          From {pet.name}
        </h2>
        <div className="mt-2">
          <NotificationFeed items={feedRes.data ?? []} />
        </div>
      </section>

      <section aria-labelledby="achievements" className="pixel-card mt-3 p-3">
        <h2 id="achievements" className="font-display text-[0.7rem] uppercase tracking-wide">
          Achievements
        </h2>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {achievements.map((a) => {
            const has = unlocked.includes(a.key)
            return (
              <li
                key={a.key}
                title={a.description}
                className={`border-[3px] px-2 py-1 font-display text-[0.58rem] uppercase ${
                  has ? 'border-ink bg-moss text-paper' : 'border-ink-soft/40 text-ink-soft'
                }`}
              >
                {a.name}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="breed-notes" className="pixel-card mt-3 p-3">
        <h2 id="breed-notes" className="font-display text-[0.7rem] uppercase tracking-wide">
          About your {pet.breed}
        </h2>
        <p className="mt-2 text-ink-soft">{breedRes.data?.care_notes}</p>
        <ul className="mt-2 space-y-1">
          {(linksRes.data ?? []).map((link) => (
            <li key={link.situation}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                {link.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
