'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState, useSyncExternalStore, useTransition } from 'react'
import { claimDailyReward, performAction } from '@/app/actions'
import StatBar from '@/components/StatBar'
import { mood, neediestStat, projectStats } from '@/lib/stats'
import type {
  Accessory, Achievement, Action, Breed, Pet, PetState, Profile, StatConfig, StatKey,
} from '@/lib/types'
import { ROOM_FLOOR, ROOM_HORIZON_PCT, ROOM_WALL } from '@/components/PetStage'

const PetStage = dynamic(() => import('@/components/PetStage'), {
  ssr: false,
  loading: () => <div className="h-full" />,
})

const TICK_MS = 20_000

function subscribeToClock(onChange: () => void) {
  const id = setInterval(onChange, TICK_MS)
  return () => clearInterval(id)
}

type Props = {
  pet: Pet
  profile: Profile
  initialState: PetState
  breed: Breed
  statConfig: StatConfig[]
  actions: Action[]
  equipped: Accessory[]
  achievements: Achievement[]
  contentLinks: Record<string, { title: string; url: string }>
  lastActionAt: Record<string, string>
}

export default function Dashboard({
  pet, profile, initialState, breed, statConfig, actions, equipped,
  achievements, contentLinks, lastActionAt,
}: Props) {
  const [state, setState] = useState(initialState)
  const [coins, setCoins] = useState(profile.coins)
  const [streak, setStreak] = useState(profile.streak_count)
  const [claimed, setClaimed] = useState(
    profile.last_reward_claim ===
      new Date().toLocaleDateString('en-CA', { timeZone: profile.timezone })
  )
  const [lastAt, setLastAt] = useState(lastActionAt)
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [burst, setBurst] = useState<{ key: string; nonce: number }>()
  const [pending, startTransition] = useTransition()

  // A clock that ticks every 20s so the displayed decay stays live. The server
  // snapshot is the decay anchor, so SSR and the first client render agree.
  // Display only — authoritative numbers come back from perform_action (§3.2).
  const now = useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => new Date(initialState.stats_updated_at).getTime()
  )

  const rates = useMemo(
    () => Object.fromEntries(statConfig.map((s) => [s.stat, s.decay_per_hour])),
    [statConfig]
  )
  const shown = useMemo(
    () => projectStats(state, rates, breed.decay_overrides, now),
    [state, rates, breed.decay_overrides, now]
  )

  const currentMood = mood(shown)
  const needs = neediestStat(shown)
  // Contextual help only when something actually slips (spec §9, non-intrusive);
  // healthy pets keep the screen clean.
  const struggling = shown[needs] < 60
  const link = struggling ? contentLinks[needs] : undefined

  // id only exists to restart the toast animation, so a counter beats a clock.
  const flash = (text: string) => setToast((prev) => ({ text, id: (prev?.id ?? 0) + 1 }))

  const care = (action: Action) => {
    startTransition(async () => {
      const res = await performAction(pet.id, action.key)
      if (!res.ok) return flash(res.error)

      setState(res.result.state)
      setCoins(res.result.coins)
      setLastAt((prev) => ({ ...prev, [action.key]: new Date().toISOString() }))
      setBurst({ key: res.result.effect, nonce: Date.now() })

      const names = res.result.unlocked
        .map((key) => achievements.find((a) => a.key === key)?.name)
        .filter(Boolean)
      flash(names.length ? `Unlocked: ${names.join(', ')}` : `+${res.result.coins_earned} coins`)
    })
  }

  const claim = () => {
    startTransition(async () => {
      const res = await claimDailyReward()
      if (!res.ok) return flash(res.error)
      setCoins(res.coins)
      setStreak(res.streak)
      setClaimed(true)
      flash(`+${res.reward} coins - day ${res.streak}`)
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-2 pb-2">
      <header className="flex shrink-0 items-center justify-between gap-2">
        <h1 className="font-display text-lg leading-none">{pet.name}</h1>
        <div className="flex gap-1.5">
          <span className="pixel-chip tabular-nums">{coins} coins</span>
          <span className="pixel-chip tabular-nums">day {streak}</span>
        </div>
      </header>

      {/* The room. Letterbox blends into the same wall/floor split. */}
      <section
        className="relative min-h-0 flex-1 border-[3px] border-ink"
        style={{
          background: `linear-gradient(to bottom, ${ROOM_WALL} 0 ${ROOM_HORIZON_PCT}%, ${ROOM_FLOOR} ${ROOM_HORIZON_PCT}%)`,
        }}
      >
        <PetStage
          species={pet.species}
          breed={pet.breed}
          color={pet.color}
          pattern={String(pet.appearance?.pattern ?? 'solid')}
          mood={currentMood}
          accessories={equipped.map((a) => ({ slot: a.slot, asset: a.asset }))}
          effect={burst}
          className="h-full w-full"
        />

        {/* Floating daily reward, game-HUD style. */}
        <button
          type="button"
          onClick={claim}
          disabled={pending || claimed}
          className="pixel-btn pixel-btn-primary absolute top-2 right-2"
        >
          {claimed ? 'Claimed' : 'Gift'}
        </button>

        {toast && (
          <p
            key={toast.id}
            role="status"
            className="float-up pointer-events-none absolute inset-x-2 bottom-3 text-center font-display text-sm text-ink [text-shadow:1px_1px_0_var(--color-paper)]"
          >
            {toast.text}
          </p>
        )}
      </section>

      <section aria-label="Stats" className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1.5">
        {statConfig.map((s) => (
          <StatBar key={s.stat} label={s.label} value={shown[s.stat as StatKey]} />
        ))}
      </section>

      {link && (
        <p className="shrink-0 text-center text-sm leading-tight text-ink-soft">
          {LEAD_IN[needs] ?? 'Worth a read:'}{' '}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {link.title}
          </a>
        </p>
      )}

      <section aria-label="Care actions" className="grid shrink-0 grid-cols-4 gap-1.5">
        {actions.map((action) => (
          <CareButton
            key={action.key}
            action={action}
            lastAt={lastAt[action.key]}
            now={now}
            disabled={pending}
            onClick={() => care(action)}
          />
        ))}
      </section>
    </div>
  )
}

/** Reads as the pet's situation rather than a generic "learn more" nudge. */
const LEAD_IN: Partial<Record<StatKey, string>> = {
  hunger: 'Hungry pet?',
  cleanliness: 'Coat looking rough?',
  exercise: 'Restless?',
  mental_stimulation: 'Bored pet?',
  happiness: 'Low mood?',
  energy: 'Always tired?',
  health: 'Health slipping?',
}

function CareButton({
  action, lastAt, now, disabled, onClick,
}: {
  action: Action
  lastAt?: string
  now: number
  disabled: boolean
  onClick: () => void
}) {
  const readyAt = lastAt ? new Date(lastAt).getTime() + action.cooldown_seconds * 1000 : 0
  const waiting = Math.max(0, readyAt - now)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || waiting > 0}
      className="pixel-btn pixel-btn-sm"
    >
      {action.label}
      {waiting > 0 && (
        <span className="block font-sans text-xs tabular-nums text-ink-soft">
          {formatWait(waiting)}
        </span>
      )}
    </button>
  )
}

function formatWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.ceil(minutes / 60)}h`
}
