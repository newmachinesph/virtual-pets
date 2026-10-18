import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'
import { createClient } from '@/lib/supabase/server'
import type {
  Accessory, Achievement, Action, Breed, Pet, PetState, Profile, StatConfig,
} from '@/lib/types'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pet } = await supabase.from('pets').select('*').limit(1).maybeSingle()
  if (!pet) redirect('/create')

  // Everything the game screen needs, in parallel. Journal fetches its own.
  const [profileRes, stateRes, breedRes, statsRes, actionsRes, equippedRes, achievementsRes, linksRes, logRes] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.rpc('pet_current_state', { p_pet_id: pet.id }).single(),
      supabase.from('breeds').select('*').eq('species', pet.species).eq('name', pet.breed).single(),
      supabase.from('stat_config').select('*'),
      supabase.from('actions').select('*'),
      supabase.from('pet_equipped').select('slot, accessories(*)').eq('pet_id', pet.id),
      supabase.from('achievements').select('*'), // names for unlock toasts
      supabase.from('content_links').select('*'),
      // Recent actions drive the cooldown countdowns without a second round trip.
      supabase.from('pet_action_log').select('action, created_at')
        .eq('pet_id', pet.id).order('created_at', { ascending: false }).limit(40),
    ])

  const lastActionAt: Record<string, string> = {}
  for (const row of logRes.data ?? []) {
    lastActionAt[row.action] ??= row.created_at
  }

  const equipped = (equippedRes.data ?? [])
    .map((row) => (row as unknown as { accessories: Accessory }).accessories)
    .filter(Boolean)

  return (
    <Dashboard
      pet={pet as Pet}
      profile={profileRes.data as Profile}
      initialState={stateRes.data as PetState}
      breed={breedRes.data as Breed}
      statConfig={(statsRes.data ?? []) as StatConfig[]}
      actions={(actionsRes.data ?? []) as Action[]}
      equipped={equipped}
      achievements={(achievementsRes.data ?? []) as Achievement[]}
      contentLinks={Object.fromEntries(
        (linksRes.data ?? []).map((l) => [l.situation, { title: l.title, url: l.url }])
      )}
      lastActionAt={lastActionAt}
    />
  )
}
