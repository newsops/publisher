import { pages, publication } from '@publisher/content'
import type { Metadata } from 'next'
import SiteChrome from '../components/SiteChrome'

export const metadata: Metadata = {
  title: `About ${publication.name}`,
  description: publication.description,
  alternates: { canonical: '/about.html' },
}

export default function AboutPage() {
  const page = pages.find((item) => item.slug === 'about')
  return (
    <SiteChrome>
      <main className="container post-body">
        <h1>{page?.title}</h1>
        <p>{page?.body}</p>
      </main>
    </SiteChrome>
  )
}
