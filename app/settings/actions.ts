'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SettingsState = { error: string } | { saved: true } | null

/** Any IANA zone the runtime knows is valid; anything else throws. */
function isValidTimezone(zone: string): boolean {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const displayName = String(formData.get('display_name') ?? '').trim()
  const pushEnabled = formData.get('notif_push_enabled') === 'on'
  const emailEnabled = formData.get('notif_email_enabled') === 'on'
  const quietStart = Number(formData.get('quiet_start'))
  const quietEnd = Number(formData.get('quiet_end'))
  const timezone = String(formData.get('timezone') ?? '')

  if (displayName.length > 60) {
    return { error: 'Display name can be at most 60 characters.' }
  }
  for (const hour of [quietStart, quietEnd]) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return { error: 'Quiet hours must be whole hours between 0 and 23.' }
    }
  }
  if (!isValidTimezone(timezone)) {
    return { error: 'That timezone is not recognized.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are signed out. Sign in and try again.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName || null,
      notif_push_enabled: pushEnabled,
      notif_email_enabled: emailEnabled,
      quiet_start: quietStart,
      quiet_end: quietEnd,
      timezone,
    })
    .eq('id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/settings')
  return { saved: true }
}
