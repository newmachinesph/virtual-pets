import { statTone } from '@/lib/stats'

const TONE_COLOR = {
  critical: 'var(--color-alarm)',
  low: 'var(--color-amber)',
  ok: 'var(--color-accent)',
  good: 'var(--color-moss)',
} as const

const SEGMENTS = 10

type Props = { label: string; value: number }

/** Segmented pixel meter — health bars, not progress bars. Compact HUD size. */
export default function StatBar({ label, value }: Props) {
  const tone = statTone(value)
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * SEGMENTS)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[0.55rem] uppercase tracking-wide">{label}</span>
        <span className="text-xs tabular-nums text-ink-soft">{Math.round(value)}</span>
      </div>
      <div
        className="flex gap-[2px] border-2 border-ink bg-card p-[2px]"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className="h-2 flex-1"
            style={{ backgroundColor: i < filled ? TONE_COLOR[tone] : 'var(--color-paper-deep)' }}
          />
        ))}
      </div>
    </div>
  )
}
