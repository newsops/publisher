import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { publication, renderPluginContributions } from '@publisher/content'
import { PluginHeadContributions } from './components/plugins/PluginContributions'
import { buildPublicPluginSnapshot } from './lib/public-plugins'
import './styles.css'

export const metadata: Metadata = {
  metadataBase: new URL(publication.canonicalOrigin),
  title: publication.name,
  description: publication.description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: publication.name,
    title: publication.name,
    description: publication.description,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: publication.name,
    description: publication.description,
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pluginContributions = renderPluginContributions(
    buildPublicPluginSnapshot(),
  )
  return (
    <html lang={publication.language}>
      <head>
        <PluginHeadContributions contributions={pluginContributions} />
        <link rel="stylesheet" href="/theme-runtime/current.css" />
        <script src="/site-runtime/projection-bootstrap.v1.js" defer />
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${publication.name} RSS`}
          href="/feed.xml"
        />
        <link
          rel="alternate"
          type="application/atom+xml"
          title={`${publication.name} Atom`}
          href="/feeds/posts/default.xml"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
