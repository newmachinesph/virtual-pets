'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Pet' },
  { href: '/journal', label: 'Journal' },
  { href: '/shop', label: 'Shop' },
  { href: '/settings', label: 'Settings' },
] as const

/** Bottom mobile nav. Hidden outside the game (login, creation flow). */
export default function TabBar() {
  const pathname = usePathname()
  if (pathname.startsWith('/login') || pathname.startsWith('/create')) return null

  return (
    <nav aria-label="Main" className="shrink-0 border-t-4 border-ink bg-card">
      <ul className="flex">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`block py-3 text-center font-display text-[0.62rem] uppercase tracking-wide ${
                  active ? 'bg-accent text-paper' : 'text-ink hover:bg-accent-soft'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
