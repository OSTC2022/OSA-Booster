import type { MetadataRoute } from 'next'
import { PWA_ASSET_VERSION } from '@/lib/pwa-splash-links'

export default function manifest(): MetadataRoute.Manifest {
  const iconQuery = `v=${PWA_ASSET_VERSION}`

  return {
    id: 'booster-running-crew-pwa',
    name: '부스터 러닝크루',
    short_name: '부스터 러닝크루',
    description: 'Booster Running Crew',
    scope: '/',
    start_url: '/',
    display: 'standalone',
    display_override: ['standalone', 'fullscreen'],
    background_color: '#090b12',
    theme_color: '#090b12',
    orientation: 'portrait-primary',
    lang: 'ko',
    prefer_related_applications: false,
    icons: [
      {
        src: `/icons/icon-192.png?${iconQuery}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/icon-512.png?${iconQuery}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/icon-512-maskable.png?${iconQuery}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
