import type { Metadata } from 'next'
import './globals.css'
import { AppProviders } from '@/components/providers/app-providers'

export const metadata: Metadata = {
  title: 'AETHER AI',
  description: 'Cinematic multimodal generative AI operating system for creators.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
