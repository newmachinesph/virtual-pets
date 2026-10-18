'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type CreateState = { error: string } | null

const SPECIES = ['dog', 'cat'] as const
const PATTERNS = ['solid', 'patch', 'spots'] as const
const TRAITS = ['playful', 'calm', 'curious', 'stubborn', 'clingy', 'independent']

export async function createPet(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Validate every field at the boundary — RLS protects ownership, not shape.
  const species = String(formData.get('species') ?? '')
  const breed = String(formData.get('breed') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const color = String(formData.get('color') ?? '#c9863f')
  const pattern = String(formData.get('pattern') ?? 'solid')
  const personality = formData.getAll('personality').map(String).filter((t) => TRAITS.includes(t))

  if (!SPECIES.includes(species as (typeof SPECIES)[number])) return { error: 'Pick a dog or a cat.' }
  if (!name || name.length > 24) return { error: 'Give your pet a name of 1–24 characters.' }
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { error: 'That colour is not a valid hex value.' }
  if (!PATTERNS.includes(pattern as (typeof PATTERNS)[number])) return { error: 'Unknown coat pattern.' }

  const { error } = await supabase.from('pets').insert({
    owner_id: user.id,
    species,
    breed,
    name,
    color,
    appearance: { pattern },
    personality: personality.slice(0, 3),
  })

  // The breed FK rejects a species/breed mismatch; the unique index rejects a second pet.
  if (error) {
    return {
      error: error.code === '23505' ? 'You already have a pet.' : 'That breed does not match the species.',
    }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
