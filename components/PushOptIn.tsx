'use client'

import { useEffect, useState } from 'react'

type PushStatus = 'checking' | 'unsupported' | 'denied' | 'off' | 'on'

/** Web Push wants the VAPID key as raw bytes, not base64url. */
function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

export default function PushOptIn() {
  const [status, setStatus] = useState<PushStatus>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Browser APIs only in the effect — this component also renders on the server.
  useEffect(() => {
    let cancelled = false
    async function detect(): Promise<PushStatus> {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return 'unsupported'
      }
      if (Notification.permission === 'denied') return 'denied'
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        return subscription ? 'on' : 'off'
      } catch {
        return 'off'
      }
    }
    detect().then((next) => {
      if (!cancelled) setStatus(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      // Permission prompt only here, on the click — never on page load.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error('Push is not configured on this server.')
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!response.ok) throw new Error('Could not save the subscription.')
      setStatus('on')
    } catch (err) {
      console.error('push opt-in failed', err)
      setError(err instanceof Error ? err.message : 'Something went wrong enabling push.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      await subscription?.unsubscribe()
      const response = await fetch('/api/push/subscribe', { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not remove the subscription.')
      setStatus('off')
    } catch (err) {
      console.error('push opt-out failed', err)
      setError(err instanceof Error ? err.message : 'Something went wrong disabling push.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'unsupported') {
    return <p className="text-sm text-ink-soft">This browser does not support push notifications.</p>
  }
  if (status === 'denied') {
    return (
      <p className="text-sm text-ink-soft">
        Notifications are blocked for this site. Allow them in your browser settings to enable push.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={status === 'on' ? disable : enable}
        disabled={busy || status === 'checking'}
        className="pixel-btn pixel-btn-primary"
      >
        {status === 'checking' && 'Checking push status…'}
        {status === 'on' && (busy ? 'Turning off…' : 'Turn off push on this device')}
        {status === 'off' && (busy ? 'Turning on…' : 'Turn on push on this device')}
      </button>
      {status === 'on' && <p className="text-sm text-moss">Push is on for this device.</p>}
      {error && (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      )}
    </div>
  )
}
