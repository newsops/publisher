import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Publisher Admin',
  description: 'Private Publisher content administration.',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
