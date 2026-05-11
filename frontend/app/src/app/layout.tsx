import type { Metadata } from 'next'
import { AppProviders } from '@/components/providers/app-providers'
import { ToastRegion } from '@/components/ui/toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'AETHER AI',
  description: 'Multimodal creative operating system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          {children}
        </AppProviders>
        <ToastRegion />
      </body>
    </html>
  )
}
