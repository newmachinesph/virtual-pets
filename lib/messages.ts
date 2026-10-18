import type { StatKey } from './types'

/**
 * Notification copy, always in the pet's voice (spec §6). Several variants per
 * stat so a daily user does not read the same sentence every day.
 */
const LINES: Record<StatKey | 'unattended', string[]> = {
  hunger: [
    '{name} is getting hungry. Can we have dinner soon?',
    "{name}'s bowl has been empty for a while now.",
    '{name} keeps looking at the cupboard. Subtle.',
  ],
  energy: [
    '{name} is worn out and could use a proper nap.',
    '{name} is running on empty. Time to rest?',
    '{name} could use fresh water and a lie-down.',
  ],
  exercise: [
    '{name} has been watching the door. A walk would fix that.',
    '{name} has energy to burn and nowhere to put it.',
  ],
  happiness: [
    '{name} is feeling a bit low today.',
    '{name} misses you. Five minutes of play would help.',
  ],
  mental_stimulation: [
    '{name} is bored and starting to get creative about it.',
    '{name} would like a puzzle, a new trick, anything really.',
  ],
  cleanliness: [
    '{name} could use a brush.',
    '{name} has picked up something questionable. Bath time?',
  ],
  health: [
    '{name} is not feeling their best. Some care would help.',
    "{name}'s health is slipping. Food, rest and a walk, in that order.",
    "{name}'s water bowl has been empty a while. A refill would help.",
  ],
  unattended: [
    '{name} has not seen you in a while and is waiting by the door.',
    '{name} misses you.',
  ],
}

/**
 * Pick a line for a stat. Deterministic on `seed` so the same notification is
 * never re-rolled between the log row and the push payload.
 */
export function petLine(type: StatKey | 'unattended', name: string, seed = Date.now()): string {
  const options = LINES[type] ?? LINES.happiness
  return options[Math.abs(seed) % options.length].replaceAll('{name}', name)
}

/** One message for several needs at once — beats three separate pushes (spec §6). */
export function batchLine(types: StatKey[], name: string, seed = Date.now()): string {
  if (types.length === 1) return petLine(types[0], name, seed)

  const needs: Partial<Record<StatKey, string>> = {
    hunger: 'a meal',
    energy: 'a nap',
    exercise: 'a walk',
    happiness: 'some company',
    mental_stimulation: 'something to do',
    cleanliness: 'a brush',
    health: 'a quiet day',
  }

  const parts = types.slice(0, 3).map((t) => needs[t] ?? 'attention')
  const list =
    parts.length === 2
      ? `${parts[0]} and ${parts[1]}`
      : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`

  return `${name} could use ${list}.`
}
