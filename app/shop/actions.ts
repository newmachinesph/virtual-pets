'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ShopResult = { ok: true; coins?: number } | { ok: false; error: string }

/** Price, balance and ownership are all checked in the DB function (spec §7). */
export async function buyAccessory(accessoryId: string): Promise<ShopResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('buy_accessory', { p_accessory_id: accessoryId })

  if (error) {
    return {
      ok: false,
      error: error.message.includes('not enough') ? 'Not enough coins yet.' : 'Could not buy that.',
    }
  }

  revalidatePath('/shop')
  revalidatePath('/')
  return { ok: true, coins: (data as { coins: number }).coins }
}

export async function equipAccessory(
  petId: string,
  slot: string,
  accessoryId: string | null
): Promise<ShopResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('equip_accessory', {
    p_pet_id: petId,
    p_slot: slot,
    p_accessory_id: accessoryId,
  })

  if (error) return { ok: false, error: 'Could not change that.' }

  revalidatePath('/shop')
  revalidatePath('/')
  return { ok: true }
}
