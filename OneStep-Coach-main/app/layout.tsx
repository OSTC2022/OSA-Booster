import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { OnestepSplashLayer } from '@/components/brand/onestep-splash-layer'
import { PwaSplashHeadLinks } from '@/components/brand/pwa-splash-head-links'
import { PwaBootstrap } from '@/components/pwa/pwa-bootstrap'
import { PwaInstallAffordance } from '@/components/pwa/pwa-install-affordance'
import { SPLASH_BOOT_SCRIPT } from '@/lib/splash-boot'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: '부스터 러닝크루',
    template: '%s · 부스터 러닝크루',
  },
  description: 'Booster Running Crew — 러닝 크루 포털',
  applicationName: '부스터 러닝크루',
  appleWebApp: {
    capable: true,
    title: '부스터 러닝크루',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-32.png?v=19', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico?v=19', sizes: '48x48' },
      { url: '/icons/icon-192.png?v=19', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=19', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-icon.png?v=19', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#090b12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`dark bg-[#090b12] ${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <PwaSplashHeadLinks />
        <script
          dangerouslySetInnerHTML={{ __html: SPLASH_BOOT_SCRIPT }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html:
              'html,body{background:#090b12!important;margin:0;padding:0}' +
              'html.onestep-splash-active,html.onestep-splash-active body{overflow:hidden;position:fixed;inset:0;width:100%;height:100%;height:100dvh;overscroll-behavior:none}' +
              '#onestep-app-splash{position:fixed;inset:0;z-index:9999;width:100%;height:100%;height:100dvh;min-height:100dvh;min-height:-webkit-fill-available;opacity:1}',
          }}
        />
      </head>
      <body
        className={`${geistSans.className} antialiased bg-[#090b12] text-foreground min-h-screen`}
      >
        <OnestepSplashLayer />
        <PwaBootstrap />
        <PwaInstallAffordance />
        <div id="app-root" className="onestep-app-root">
          {children}
          <Toaster richColors position="top-center" />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </div>
      </body>
    </html>
  )
}
