import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Accessory, Pet } from '@/lib/types'
import ShopClient from './ShopClient'

export default async function ShopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pet } = await supabase.from('pets').select('*').limit(1).maybeSingle()
  if (!pet) redirect('/create')

  const [profileRes, accessoriesRes, ownedRes, equippedRes] = await Promise.all([
    supabase.from('profiles').select('coins').eq('id', user.id).single(),
    // Species-gated: a bandana is not a cat item.
    supabase.from('accessories').select('*').or(`species.is.null,species.eq.${pet.species}`),
    supabase.from('user_accessories').select('accessory_id'),
    supabase.from('pet_equipped').select('slot, accessory_id').eq('pet_id', pet.id),
  ])

  return (
    <ShopClient
      pet={pet as Pet}
      coins={profileRes.data?.coins ?? 0}
      accessories={(accessoriesRes.data ?? []) as Accessory[]}
      owned={(ownedRes.data ?? []).map((r) => r.accessory_id)}
      equipped={Object.fromEntries((equippedRes.data ?? []).map((r) => [r.slot, r.accessory_id]))}
    />
  )
}
