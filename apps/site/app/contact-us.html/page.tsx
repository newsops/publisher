import { pages, publication } from '@publisher/content'
import type { Metadata } from 'next'
import SiteChrome from '../components/SiteChrome'

export const metadata: Metadata = {
  title: `Contact Us | ${publication.name}`,
  description: `Contact the ${publication.name} editorial team.`,
  alternates: { canonical: '/contact-us.html' },
}

export default function ContactPage() {
  const page = pages.find((item) => item.slug === 'contact')
  return (
    <SiteChrome>
      <main className="container post-body">
        <h1>{page?.title}</h1>
        <p>{page?.body}</p>
        <form action="/contact-submitted.html" method="get">
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Message
            <textarea name="message" required />
          </label>
          <button type="submit">Send</button>
        </form>
      </main>
    </SiteChrome>
  )
}
