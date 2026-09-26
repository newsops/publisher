import Link from 'next/link'
import type { Metadata } from 'next'
import {
  getArchivePaths,
  getPostPath,
  posts,
  publication,
} from '@publisher/content'
import { notFound } from 'next/navigation'
import SiteChrome, { longDate } from '../../components/SiteChrome'

const EMPTY_ARCHIVE = { year: '1970', month: '01' }

export function generateStaticParams() {
  const params = getArchivePaths().map((path) => {
    const [, year, month] = path.split('/')
    return { year, month }
  })
  return params.length > 0 ? params : [EMPTY_ARCHIVE]
}

function monthLabel(year: string, month: string): string {
  return new Date(`${year}-${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; month: string }>
}): Promise<Metadata> {
  const { year, month } = await params
  const label = monthLabel(year, month)
  return {
    title: `${label} archive | ${publication.name}`,
    description: `${publication.name} articles published in ${label}.`,
    alternates: { canonical: `/${year}/${month}/` },
  }
}

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ year: string; month: string }>
}) {
  const { year, month } = await params
  const archivePosts = posts.filter((post) =>
    post.publishedAt.startsWith(`${year}-${month}`),
  )
  if (archivePosts.length === 0) notFound()
  return (
    <SiteChrome>
      <main className="post-body">
        <div className="section-heading">
          <h1>{monthLabel(year, month)}</h1>
          <Link href="/search">All articles</Link>
        </div>
        <div className="post-list" data-variant="list">
          {archivePosts.map((post) => (
            <article className="post-card" key={post.slug}>
              <Link
                className="post-image"
                href={getPostPath(post)}
                tabIndex={-1}
                aria-hidden="true"
              >
                {post.imageUrl ? (
                  <img src={post.imageUrl} alt="" loading="lazy" />
                ) : null}
              </Link>
              <div className="post-copy">
                <Link
                  className="category"
                  href={`/search/label/${post.categories[0]}`}
                >
                  {post.categories[0]}
                </Link>
                <h2 className="post-title">
                  <Link href={getPostPath(post)}>{post.title}</Link>
                </h2>
                <p className="excerpt">{post.excerpt}</p>
                <p className="post-date">{longDate(post.publishedAt)}</p>
              </div>
            </article>
          ))}
        </div>
      </main>
    </SiteChrome>
  )
}
