import { timingSafeEqual } from 'node:crypto'
import type { PushSubscription as WebPushSubscription } from 'web-push'
import { sendMail } from '@/lib/mail'
import { batchLine, petLine } from '@/lib/messages'
import { sendPush } from '@/lib/push'
import { createServiceClient } from '@/lib/supabase/server'
import { STAT_KEYS, type StatKey } from '@/lib/types'

/**
 * Notification engine (spec §3.3 / §6).
 *
 * The spec sketches pg_cron → Edge Function; this route handler replaces the
 * Edge Function so the whole app stays one Next.js deploy. Schedule it every
 * 15 minutes either via vercel.json (see repo root — Vercel sends the
 * CRON_SECRET as a Bearer token automatically) or via pg_cron + pg_net:
 *
 *   select cron.schedule('notify-check', '0,15,30,45 * * * *', $$
 *     select net.http_post(
 *       url     := 'https://<app-host>/api/cron/notify-check',
 *       headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
 *     )
 *   $$);
 *
 * The notify_candidates() SQL function owns prefs, quiet hours and per-type
 * cooldowns — nothing here re-implements those. This handler batches, sends,
 * prunes dead subscriptions, applies the global daily cap and logs.
 */

const DAILY_CAP = 6
const COOLDOWN_HOURS = 6
const DAY_MS = 24 * 60 * 60 * 1000

type Service = ReturnType<typeof createServiceClient>

/** Row shape of notify_candidates(). */
type Candidate = {
  user_id: string
  pet_id: string
  pet_name: string
  species: string
  push_subscription: WebPushSubscription | null
  email_enabled: boolean
  types: string[]
}

type IdleProfile = {
  id: string
  push_subscription: WebPushSubscription | null
  notif_push_enabled: boolean
  notif_email_enabled: boolean
  quiet_start: number
  quiet_end: number
  timezone: string
  pets: { id: string; name: string }[] | null
}

/**
 * Mirrors in_quiet_hours() in the functions migration. notify_candidates()
 * applies it to stat notifications, but the unattended nudge is found here, and
 * a 3am "your pet misses you" is exactly the spam the spec rules out (§6).
 */
function inQuietHours(profile: IdleProfile): boolean {
  const { quiet_start: start, quiet_end: end } = profile
  if (start === end) return false

  let hour: number
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric', hour12: false, timeZone: profile.timezone,
      }).format(new Date())
    )
  } catch {
    return false // an unusable stored timezone must not silence notifications
  }

  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function underDailyCap(supabase: Service, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const { count, error } = await supabase
    .from('notifications_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
  if (error) throw new Error(`daily cap check: ${error.message}`)
  return (count ?? 0) < DAILY_CAP
}

async function nudgedInLastDay(supabase: Service, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const { count, error } = await supabase
    .from('notifications_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'unattended')
    .gte('created_at', since)
  if (error) throw new Error(`unattended check: ${error.message}`)
  return (count ?? 0) > 0
}

/**
 * Send one notification over every enabled channel and log each channel that
 * actually went out. The in_app row is unconditional so the feed always shows
 * the message even when push/email fail.
 */
async function deliver(
  supabase: Service,
  input: {
    userId: string
    petId: string
    type: string
    title: string
    message: string
    url: string
    push: WebPushSubscription | null
    email: boolean
  }
): Promise<{ pruned: boolean }> {
  const channels = ['in_app']
  let pruned = false

  if (input.push) {
    const result = await sendPush(input.push, {
      title: input.title,
      body: input.message,
      url: input.url,
      tag: input.type,
    })
    if (result === 'sent') channels.push('push')
    if (result === 'expired') {
      // Browser dropped the subscription — prune it (spec §10 reliability).
      const { error } = await supabase
        .from('profiles')
        .update({ push_subscription: null })
        .eq('id', input.userId)
      if (error) console.error('prune subscription failed', input.userId, error.message)
      else pruned = true
    }
  }

  if (input.email) {
    const { data, error } = await supabase.auth.admin.getUserById(input.userId)
    const address = data?.user?.email
    if (error || !address) {
      console.error('email address lookup failed', input.userId, error?.message ?? 'no address')
    } else {
      try {
        await sendMail(address, `${input.title} needs you`, input.message, input.url)
        channels.push('email')
      } catch (err) {
        console.error('email send failed', input.userId, (err as Error).message)
      }
    }
  }

  const { error } = await supabase.from('notifications_log').insert(
    channels.map((channel) => ({
      user_id: input.userId,
      pet_id: input.petId,
      type: input.type,
      message: input.message,
      channel,
    }))
  )
  if (error) throw new Error(`log insert: ${error.message}`)

  return { pruned }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const url = new URL(request.url).origin + '/'
  const totals = { checked: 0, sent: 0, skipped: 0, pruned: 0, errors: 0 }

  // 1. Low-stat candidates. One batched message per pet (spec §6 anti-spam).
  const { data: candidateData, error: candidateError } = await supabase.rpc('notify_candidates', {
    p_cooldown_hours: COOLDOWN_HOURS,
  })
  if (candidateError) {
    console.error('notify_candidates failed', candidateError.message)
    totals.errors += 1
  }
  const candidates = (candidateData ?? []) as Candidate[]

  for (const candidate of candidates) {
    totals.checked += 1
    try {
      const types = candidate.types.filter((t): t is StatKey =>
        (STAT_KEYS as readonly string[]).includes(t)
      )
      if (types.length === 0 || !(await underDailyCap(supabase, candidate.user_id))) {
        totals.skipped += 1
        continue
      }
      const { pruned } = await deliver(supabase, {
        userId: candidate.user_id,
        petId: candidate.pet_id,
        // Worst stat first per the RPC contract — that is the logged type.
        type: types[0],
        title: candidate.pet_name,
        message: batchLine(types, candidate.pet_name),
        url,
        push: candidate.push_subscription,
        email: candidate.email_enabled,
      })
      totals.sent += 1
      if (pruned) totals.pruned += 1
    } catch (err) {
      console.error('candidate failed', candidate.user_id, (err as Error).message)
      totals.errors += 1
    }
  }

  // 2. Unattended nudge: last_active_at older than 24h, max once per day.
  const cutoff = new Date(Date.now() - DAY_MS).toISOString()
  const { data: idleData, error: idleError } = await supabase
    .from('profiles')
    .select(
      'id, push_subscription, notif_push_enabled, notif_email_enabled, quiet_start, quiet_end, timezone, pets(id, name)'
    )
    .lt('last_active_at', cutoff)
  if (idleError) {
    console.error('unattended query failed', idleError.message)
    totals.errors += 1
  }
  const idle = (idleData ?? []) as IdleProfile[]

  for (const profile of idle) {
    totals.checked += 1
    try {
      const pet = profile.pets?.[0]
      if (!pet) continue
      if (
        inQuietHours(profile) ||
        (await nudgedInLastDay(supabase, profile.id)) ||
        !(await underDailyCap(supabase, profile.id))
      ) {
        totals.skipped += 1
        continue
      }
      const { pruned } = await deliver(supabase, {
        userId: profile.id,
        petId: pet.id,
        type: 'unattended',
        title: pet.name,
        message: petLine('unattended', pet.name),
        url,
        push: profile.notif_push_enabled ? profile.push_subscription : null,
        email: profile.notif_email_enabled,
      })
      totals.sent += 1
      if (pruned) totals.pruned += 1
    } catch (err) {
      console.error('unattended failed', profile.id, (err as Error).message)
      totals.errors += 1
    }
  }

  return Response.json(totals)
}

// Vercel Cron invokes with GET; the Bearer check above applies either way.
export { POST as GET }
