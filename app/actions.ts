'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'

export type CareResult = { ok: true; result: ActionResult } | { ok: false; error: string }

/**
 * Every care action goes through the DB function, which settles decay, applies
 * the deltas, enforces the cooldown and evaluates achievements in one
 * transaction (spec §3.2). Nothing here recomputes stats.
 */
export async function performAction(petId: string, action: string): Promise<CareResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('perform_action', {
    p_pet_id: petId,
    p_action: action,
  })

  if (error) {
    // 55006 carries the seconds remaining in `details`.
    if (error.code === '55006') {
      const seconds = Number(error.details)
      return {
        ok: false,
        error: Number.isFinite(seconds)
          ? `Not yet — try again in ${formatWait(seconds)}.`
          : 'Not yet.',
      }
    }
    return { ok: false, error: 'That did not go through. Try again.' }
  }

  revalidatePath('/')
  return { ok: true, result: data as ActionResult }
}

export type RewardResult =
  | { ok: true; reward: number; streak: number; coins: number; unlocked: string[] }
  | { ok: false; error: string }

export async function claimDailyReward(): Promise<RewardResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('claim_daily_reward')

  if (error) {
    return {
      ok: false,
      error: error.code === '55006' ? 'Already claimed today. Come back tomorrow.' : 'Could not claim.',
    }
  }

  revalidatePath('/')
  return { ok: true, ...(data as Omit<RewardResult & { ok: true }, 'ok'>) }
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const minutes = Math.ceil(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)}h`
}
