import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  categories,
  getArchiveMonths,
  getPostPath,
  posts,
  tags,
} from '@publisher/content'
import ProgressivePostFeed, { type FeedPost } from './ProgressivePostFeed'
import { longDate } from './SiteChrome'

export const INDEX_PAGE_SIZE = 5

type Post = (typeof posts)[number]

const MONTH_NAMES = [
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

function monthLabel(year: string, month: string): string {
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`
}

export function totalPages(count: number): number {
  return Math.max(1, Math.ceil(count / INDEX_PAGE_SIZE))
}

export function pagePosts(
  allPosts: readonly FeedPost[],
  page: number,
): readonly FeedPost[] {
  return allPosts.slice((page - 1) * INDEX_PAGE_SIZE, page * INDEX_PAGE_SIZE)
}

export function leadPost(allPosts: readonly Post[]): Post {
  return allPosts.find((post) => post.featured) ?? allPosts[0]
}

export function trailingPosts(allPosts: readonly Post[]): readonly Post[] {
  const lead = leadPost(allPosts)
  return allPosts.filter((post) => post.slug !== lead?.slug)
}

function pageHref(basePath: string, page: number): string {
  if (page <= 1) return basePath || '/'
  return `${basePath || ''}/page/${page}/`
}

function Pagination({
  basePath,
  page,
  pages,
}: {
  basePath: string
  page: number
  pages: number
}) {
  return (
    <nav className="pagination" aria-label="Page navigation">
      {page > 1 ? (
        <Link href={pageHref(basePath, page - 1)}>Previous</Link>
      ) : (
        <span aria-hidden="true">Previous</span>
      )}
      <div className="pagination-numbers">
        {Array.from({ length: pages }, (_, index) => index + 1).map((number) =>
          number === page ? (
            <strong key={number} aria-current="page">
              {number}
            </strong>
          ) : (
            <Link key={number} href={pageHref(basePath, number)}>
              {number}
            </Link>
          ),
        )}
      </div>
      {page < pages ? (
        <Link href={pageHref(basePath, page + 1)}>Next</Link>
      ) : (
        <span aria-hidden="true">Next</span>
      )}
    </nav>
  )
}

function toFeedPost(post: Post): FeedPost {
  return {
    title: post.title,
    slug: post.slug,
    path: getPostPath(post),
    excerpt: post.excerpt,
    categories: post.categories,
    publishedAt: post.publishedAt,
    imageUrl: post.imageUrl,
  }
}

export default function PostIndexPage({
  title,
  allPosts,
  page,
  basePath = '',
  category,
  exclude,
  level = 1,
  variant = 'list',
  lead,
}: {
  title: string
  allPosts: readonly Post[]
  page: number
  basePath?: string
  category?: string
  exclude?: string
  level?: 1 | 2
  variant?: 'grid' | 'list'
  lead?: ReactNode
}) {
  const feedPosts = allPosts.map(toFeedPost)
  const currentPosts = pagePosts(feedPosts, page)
  const pages = totalPages(feedPosts.length)
  const Heading = level === 2 ? 'h2' : 'h1'
  const onThisPage = new Set([
    ...currentPosts.map((post) => post.slug),
    ...(exclude ? [exclude] : []),
  ])
  const railPosts = posts
    .filter((post) => !onThisPage.has(post.slug))
    .slice(0, 5)
  const editorialPicks = posts
    .filter((post) => post.featuredRank !== undefined)
    .sort((left, right) => (left.featuredRank ?? 0) - (right.featuredRank ?? 0))
    .slice(0, 5)
  const archiveMonths = getArchiveMonths()

  return (
    <main className="container content-grid">
      <div className="primary">
        {lead}
        <section className={lead ? 'feed-section' : undefined}>
          <div className="section-heading">
            <Heading>{title}</Heading>
            <Link href="/search">All articles</Link>
          </div>
          <ProgressivePostFeed
            initialPosts={currentPosts}
            category={category}
            exclude={exclude}
            variant={variant}
          />
          <Pagination basePath={basePath} page={page} pages={pages} />
        </section>
      </div>

      <aside className="sidebar">
        <section>
          <h2>Search</h2>
          <form action="/search" className="field-row">
            <input
              name="q"
              aria-label="Search articles"
              placeholder="Search articles"
            />
            <button type="submit">Go</button>
          </form>
        </section>

        <section>
          <h2>Editor's picks</h2>
          {editorialPicks.length > 0 ? (
            <ol className="rail-list editorial-picks">
              {editorialPicks.map((post) => (
                <li key={post.slug}>
                  <Link href={getPostPath(post)}>{post.title}</Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="sidebar-empty">No editorial picks yet.</p>
          )}
        </section>

        {railPosts.length > 0 ? (
          <section>
            <h2>More stories</h2>
            <ul className="rail-list">
              {railPosts.map((post) => (
                <li key={post.slug}>
                  <span className="rail-stamp">
                    {longDate(post.publishedAt)}
                  </span>
                  <Link href={getPostPath(post)}>{post.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2>Archive</h2>
          <ul className="archive-list">
            {archiveMonths.map((entry) => (
              <li key={entry.path}>
                <Link href={entry.path}>
                  <span>{monthLabel(entry.year, entry.month)}</span>
                  <span className="archive-count">{entry.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Sections</h2>
          <div className="sidebar-tags">
            {tags
              .filter((tag) => tag.active && categories.includes(tag.slug))
              .map((tag) => (
                <Link key={tag.slug} href={`/search/label/${tag.slug}`}>
                  {tag.name}
                </Link>
              ))}
          </div>
        </section>
      </aside>
    </main>
  )
}
