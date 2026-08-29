import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Itemku Profit Management V5.2',
    short_name: 'Itemku Profit',
    description: 'Dashboard V5.2 untuk operasional Itemku, inventory, supplier, settlement, automation, worker, dan decision intelligence.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f7fb',
    theme_color: '#111827',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
