import Link from 'next/link'

interface SearchResult {
  readonly title: string
  readonly path: string
  readonly excerpt: string
  readonly categories: readonly string[]
  readonly publishedAt: string
  readonly imageUrl?: string
}

export default function SearchResults({
  posts,
}: {
  readonly posts: readonly SearchResult[]
}) {
  return (
    <div data-static-search>
      <label htmlFor="site-search">Search articles</label>
      <input id="site-search" type="search" placeholder="Search articles" />
      <p aria-live="polite" data-search-count>
        {posts.length} results
      </p>
      <div className="post-list" data-variant="list" data-search-results>
        {posts.map((post) => (
          <article
            className="post-card"
            key={post.path}
            data-search-text={`${post.title} ${post.excerpt} ${post.categories.join(' ')}`.toLocaleLowerCase()}
          >
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
            </div>
          </article>
        ))}
      </div>
      <script src="/site-runtime/search.v1.js" defer />
    </div>
  )
}
