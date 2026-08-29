import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { PWARegister } from './pwa-register'
import ClientMonitor from './client-monitor'
import './globals.css'

export const metadata: Metadata = {
  title: 'Itemku Profit Management V5.2',
  description: 'Itemku Profit Management V5.2 untuk order, stok, profit, recovery, observability, worker, supplier, dan kontrol operasional.',
  manifest: '/manifest.webmanifest',
  robots: { index:false, follow:false, nocache:true },
  appleWebApp: { capable: true, title: 'Itemku Profit', statusBarStyle: 'default' },
  icons: { icon: [{url:'/icon-light-32x32.png',media:'(prefers-color-scheme: light)'},{url:'/icon-dark-32x32.png',media:'(prefers-color-scheme: dark)'},{url:'/icon.svg',type:'image/svg+xml'}], apple:'/apple-icon.png' },
}
export const viewport: Viewport = { colorScheme:'light dark', themeColor:[{media:'(prefers-color-scheme: light)',color:'#ffffff'},{media:'(prefers-color-scheme: dark)',color:'#111827'}] }
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id" suppressHydrationWarning><body className="antialiased"><ClientMonitor/>{children}<div className="fixed bottom-4 right-4 z-50"><PWARegister/></div>{process.env.NODE_ENV==='production'&&<Analytics/>}</body></html>}
