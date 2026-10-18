import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Breed } from '@/lib/types'
import CreatePetForm from './CreatePetForm'

export default async function CreatePage() {
  const supabase = await createClient()

  const [{ data: pets }, { data: breeds }] = await Promise.all([
    supabase.from('pets').select('id').limit(1),
    supabase.from('breeds').select('*').order('name'),
  ])

  if (pets?.length) redirect('/')

  return <CreatePetForm breeds={(breeds ?? []) as Breed[]} />
}
