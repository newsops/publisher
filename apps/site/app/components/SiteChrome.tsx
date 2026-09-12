import Link from 'next/link'
import type { ReactNode } from 'react'
import { posts, publication, tags } from '@publisher/content'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function longDate(publishedAt: string): string {
  const year = publishedAt.slice(0, 4)
  const month = MONTHS[Number(publishedAt.slice(5, 7)) - 1]
  const day = Number(publishedAt.slice(8, 10))
  return `${month} ${day}, ${year}`
}

export default function SiteChrome({
  children,
}: Readonly<{ children: ReactNode }>) {
  const latest = posts[0]
  const activeTags = tags.filter((tag) => tag.active)
  return (
    <div className="site-shell" id="top">
      <header>
        <div className="topbar">
          <div className="container topbar-inner">
            <span className="topbar-date">
              {latest ? `Latest update · ${longDate(latest.publishedAt)}` : ''}
            </span>
            <nav>
              <ul className="topbar-nav">
                <li>
                  <Link href="/about.html">About us</Link>
                </li>
                <li>
                  <Link href="/contact-us.html">Contact us</Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="main-header">
          <Link className="brand" href="/">
            {publication.name}
          </Link>
        </div>

        <div className="section-nav">
          <div className="container section-nav-inner">
            <nav>
              <ul className="main-nav">
                <li>
                  <Link href="/">Home</Link>
                </li>
                {activeTags.map((tag) => (
                  <li key={tag.slug}>
                    <Link href={`/search/label/${tag.slug}`}>{tag.name}</Link>
                  </li>
                ))}
                <li>
                  <Link className="nav-search" href="/search">
                    Search
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </header>

      {children}

      <footer className="site-footer">
        <div className="container footer-main">
          <div className="footer-col">
            <h2>Sections</h2>
            {activeTags.map((tag) => (
              <Link key={tag.slug} href={`/search/label/${tag.slug}`}>
                {tag.name}
              </Link>
            ))}
          </div>
          <div className="footer-col">
            <h2>About</h2>
            <Link href="/about.html">About us</Link>
            <Link href="/contact-us.html">Contact us</Link>
          </div>
          <div className="footer-col">
            <h2>Follow</h2>
            <Link href="/feed.xml">RSS feed</Link>
            <Link href="/search">All articles</Link>
          </div>
        </div>
        <div className="container footer-bar-inner">
          <small>© 2026 {publication.publisherName}</small>
          <a className="to-top" href="#top">
            Back to top
          </a>
        </div>
      </footer>
    </div>
  )
}
