import { STAT_KEYS, type PetState, type StatKey } from './types'

const clamp = (n: number) => Math.max(0, Math.min(100, n))

/**
 * Client-side projection of the same decay the DB applies (spec §3.1).
 * Display only — every real mutation goes through perform_action (spec §3.2).
 * Kept in step with decay_stat()/drift_health() in the functions migration.
 */
export function projectStats(
  state: PetState,
  rates: Record<string, number>,
  overrides: Partial<Record<StatKey, number>>,
  now: number = Date.now()
): PetState {
  const hours = (now - new Date(state.stats_updated_at).getTime()) / 3_600_000
  if (!(hours > 0)) return state

  const out = { ...state }
  const decaying = STAT_KEYS.filter((k) => k !== 'health')

  for (const key of decaying) {
    out[key] = clamp(state[key] - (rates[key] ?? 0) * (overrides[key] ?? 1) * hours)
  }

  const target = decaying.reduce((sum, k) => sum + out[k], 0) / decaying.length
  const gap = target - state.health
  out.health = clamp(state.health + Math.sign(gap) * Math.min(Math.abs(gap), 2 * hours))

  return out
}

export type Mood = 'happy' | 'content' | 'sad' | 'sleepy'

/** Stats -> sprite state. Pure mapping in React; PetStage just plays it (spec §3.4). */
export function mood(state: PetState): Mood {
  if (state.energy < 20) return 'sleepy'
  const avg = STAT_KEYS.reduce((sum, k) => sum + state[k], 0) / STAT_KEYS.length
  if (avg < 35) return 'sad'
  return avg > 70 ? 'happy' : 'content'
}

/** The stat that most needs attention, for contextual education links (spec §9). */
export function neediestStat(state: PetState): StatKey {
  return STAT_KEYS.reduce((worst, k) => (state[k] < state[worst] ? k : worst), STAT_KEYS[0])
}

export function statTone(value: number): 'critical' | 'low' | 'ok' | 'good' {
  if (value < 15) return 'critical'
  if (value < 35) return 'low'
  return value < 70 ? 'ok' : 'good'
}
