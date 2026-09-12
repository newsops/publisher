import Link from 'next/link'

export interface FeedPost {
  title: string
  slug: string
  path: string
  excerpt: string
  categories: readonly string[]
  publishedAt: string
  imageUrl?: string
}

const SEARCH_INDEX_URL =
  process.env.NEXT_PUBLIC_SEARCH_INDEX_URL ?? '/data/search-index.local.json'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function shortDate(publishedAt: string): string {
  const month = MONTHS[Number(publishedAt.slice(5, 7)) - 1]
  return `${month} ${Number(publishedAt.slice(8, 10))}, ${publishedAt.slice(0, 4)}`
}

export default function ProgressivePostFeed({
  initialPosts,
  category,
  exclude,
  variant = 'list',
}: {
  initialPosts: readonly FeedPost[]
  category?: string
  exclude?: string
  variant?: 'grid' | 'list'
}) {
  return (
    <div
      className="post-list"
      data-variant={variant}
      data-progressive-feed="static"
      data-search-index-url={SEARCH_INDEX_URL}
      data-category={category}
      data-exclude={exclude}
    >
      {initialPosts.length === 0 ? (
        <p className="sidebar-empty">No published articles yet.</p>
      ) : (
        initialPosts.map((post) => (
          <article className="post-card" key={post.slug}>
            <Link
              className="post-image"
              href={post.path}
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
                <Link href={post.path}>{post.title}</Link>
              </h2>
              <p className="excerpt">{post.excerpt}</p>
              <p className="post-date">{shortDate(post.publishedAt)}</p>
            </div>
          </article>
        ))
      )}
    </div>
  )
}
