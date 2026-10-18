import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? 'mailto:you@example.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export type PushResult = 'sent' | 'expired' | 'failed'

/**
 * Send one push. 404/410 means the browser dropped the subscription — the
 * caller prunes it rather than retrying forever (spec §10, reliability).
 */
export async function sendPush(
  subscription: webpush.PushSubscription,
  payload: { title: string; body: string; url: string; tag?: string }
): Promise<PushResult> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
    return 'sent'
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'expired'
    console.error('push failed', status, (err as Error).message)
    return 'failed'
  }
}
