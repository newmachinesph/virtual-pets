'use client'

import { useActionState, useMemo, useSyncExternalStore } from 'react'
import type { Profile } from '@/lib/types'
import { saveSettings, type SettingsState } from './actions'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

const subscribeNoop = () => () => {}

const inputClass = 'pixel-input mt-1'

export default function SettingsForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveSettings, null)

  // Build the zone list in the browser only: the server's Intl list (and zone)
  // can differ, which would be a hydration mismatch. Until then, the saved zone.
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false)
  const zones = useMemo(() => {
    if (!isClient) return [profile.timezone].filter(Boolean)
    const supported =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
    const current = Intl.DateTimeFormat().resolvedOptions().timeZone
    return [...new Set([profile.timezone, current, ...supported])].filter(Boolean).sort()
  }, [isClient, profile.timezone])

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-ink">
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          maxLength={60}
          defaultValue={profile.display_name ?? ''}
          className={inputClass}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Notifications</legend>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="notif_push_enabled"
            defaultChecked={profile.notif_push_enabled}
            className="size-4 accent-accent"
          />
          Push notifications
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="notif_email_enabled"
            defaultChecked={profile.notif_email_enabled}
            className="size-4 accent-accent"
          />
          Email me when my pet needs something
        </label>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink">Quiet hours</legend>
        <p className="mt-1 text-xs text-ink-soft">
          No notifications between these hours. Pick the same hour twice for no quiet hours.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            From
            <select name="quiet_start" defaultValue={profile.quiet_start} className={inputClass}>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            to
            <select name="quiet_end" defaultValue={profile.quiet_end} className={inputClass}>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-ink">
          Timezone
        </label>
        <select id="timezone" name="timezone" defaultValue={profile.timezone} className={inputClass}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>

      {state && 'error' in state && (
        <p role="alert" className="text-sm text-alarm">
          {state.error}
        </p>
      )}
      {state && 'saved' in state && (
        <p role="status" className="text-sm text-moss">
          Saved.
        </p>
      )}

      <button type="submit" disabled={pending} className="pixel-btn pixel-btn-primary">
        {pending ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
