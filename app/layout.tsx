import type { Metadata, Viewport } from 'next'
import { Pixelify_Sans, VT323 } from 'next/font/google'
import './globals.css'

const pixel = Pixelify_Sans({ variable: '--font-pixel', subsets: ['latin'] })
const vt = VT323({ variable: '--font-vt323', weight: '400', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'EatWagLove — Virtual Pet',
  description: 'Raise a pixel dog or cat and learn real breed-specific pet care doing it.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'EatWagLove' },
}

export const viewport: Viewport = {
  themeColor: '#2b2118',
  width: 'device-width',
  initialScale: 1,
}

import TabBar from '@/components/TabBar'

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${pixel.variable} ${vt.variable} antialiased`}>
      <body>
        {/* One phone-width column; screens fill the height, nav stays at the
            bottom, and only list screens scroll internally. */}
        <div className="frame flex h-dvh flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
          <TabBar />
        </div>
      </body>
    </html>
  )
}
