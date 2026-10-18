'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export type FeedItem = {
  id: string
  type: string
  message: string
  read_at: string | null
  created_at: string
}

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** In-app notification feed. The dashboard passes rows from notifications_log. */
export default function NotificationFeed({ items }: { items: FeedItem[] }) {
  const marked = useRef(false)

  // Viewing the feed marks everything read; the unread styling from this
  // render stays so the user still sees what was new.
  useEffect(() => {
    if (marked.current) return
    marked.current = true
    const unreadIds = items.filter((item) => !item.read_at).map((item) => item.id)
    if (unreadIds.length === 0) return
    createClient()
      .from('notifications_log')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
      .then(({ error }) => {
        if (error) console.error('mark notifications read failed', error.message)
      })
  }, [items])

  if (items.length === 0) {
    return <p className="text-ink-soft">Nothing yet — your pet will let you know.</p>
  }

  const sorted = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <ul className="space-y-2">
      {sorted.map((item) => (
        <li
          key={item.id}
          className={`flex items-start gap-2 border-[3px] px-3 py-2 ${
            item.read_at ? 'border-ink-soft/40 bg-card' : 'border-ink bg-accent-soft/50'
          }`}
        >
          {!item.read_at && <span className="mt-2 size-2 shrink-0 bg-accent" aria-hidden="true" />}
          <div>
            {!item.read_at && <span className="sr-only">Unread: </span>}
            <p className="text-ink">{item.message}</p>
            <time dateTime={item.created_at} suppressHydrationWarning className="text-sm text-ink-soft">
              {relativeTime(item.created_at)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  )
}
