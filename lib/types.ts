/** Shapes returned by the DB. Hand-written: the schema is small and stable. */

export const STAT_KEYS = [
  'hunger',
  'happiness',
  'health',
  'energy',
  'cleanliness',
  'exercise',
  'mental_stimulation',
] as const

export type StatKey = (typeof STAT_KEYS)[number]

export type PetState = Record<StatKey, number> & {
  pet_id: string
  stats_updated_at: string
}

export type Pet = {
  id: string
  owner_id: string
  species: 'dog' | 'cat'
  breed: string
  name: string
  color: string
  appearance: Record<string, string>
  personality: string[]
}

export type Profile = {
  id: string
  display_name: string | null
  coins: number
  streak_count: number
  last_reward_claim: string | null
  notif_push_enabled: boolean
  notif_email_enabled: boolean
  quiet_start: number
  quiet_end: number
  timezone: string
}

export type Breed = {
  species: 'dog' | 'cat'
  name: string
  decay_overrides: Partial<Record<StatKey, number>>
  care_notes: string
}

export type Action = {
  key: string
  label: string
  deltas: Partial<Record<StatKey, number>>
  coin_reward: number
  cooldown_seconds: number
  effect: string
}

export type StatConfig = {
  stat: StatKey
  decay_per_hour: number
  notify_threshold: number
  label: string
}

export type Accessory = {
  id: string
  name: string
  slot: string
  species: 'dog' | 'cat' | null
  price_coins: number
  asset: string
}

export type Achievement = {
  key: string
  name: string
  description: string
  coin_reward: number
  icon: string
}

export type ActionResult = {
  state: PetState
  coins_earned: number
  coins: number
  effect: string
  unlocked: string[]
}
