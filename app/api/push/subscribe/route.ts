import { createClient } from '@/lib/supabase/server'

type Subscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Boundary validation: only accept something shaped like a PushSubscription. */
function parseSubscription(value: unknown): Subscription | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.endpoint !== 'string' || v.endpoint.length === 0) return null
  if (typeof v.keys !== 'object' || v.keys === null) return null
  const keys = v.keys as Record<string, unknown>
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null
  // Store only what web-push needs, not whatever else the browser sent.
  return { endpoint: v.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const subscription = parseSubscription(body)
  if (!subscription) {
    return Response.json({ error: 'Not a push subscription' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { error } = await supabase
    .from('profiles')
    .update({ push_subscription: subscription })
    .eq('id', user.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { error } = await supabase
    .from('profiles')
    .update({ push_subscription: null })
    .eq('id', user.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
