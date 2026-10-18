/* Service worker: Web Push receive + click-through (spec §6). Plain JS, no deps. */

self.addEventListener('push', (event) => {
  // A malformed or absent payload must still show something, never throw.
  let payload = { title: 'EatWagLove Pet', body: 'Your pet needs you.', url: '/', tag: undefined }
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json())
    } catch {
      // keep defaults
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url },
      icon: '/icon.svg',
      badge: '/icon.svg',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const target = new URL(url, self.location.origin).href
      const existing = windows.find((w) => w.url === target) || windows[0]
      if (existing) {
        if (existing.url !== target && 'navigate' in existing) existing.navigate(target)
        return existing.focus()
      }
      return self.clients.openWindow(target)
    })
  )
})
