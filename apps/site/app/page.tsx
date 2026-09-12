import Link from 'next/link'
import { getAuthor, getPostPath, posts, publication } from '@publisher/content'
import { JsonLd } from './components/JsonLd'
import PostIndexPage, {
  leadPost,
  trailingPosts,
} from './components/PostIndexPage'
import SiteChrome, { longDate } from './components/SiteChrome'

export default function HomePage() {
  const featured = leadPost(posts)
  return (
    <SiteChrome>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: publication.name,
          url: `${publication.canonicalOrigin}/`,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${publication.canonicalOrigin}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }}
      />
      {featured ? (
        <PostIndexPage
          title="Top stories"
          allPosts={trailingPosts(posts)}
          page={1}
          exclude={featured.slug}
          level={2}
          variant="grid"
          lead={<FeaturedPost />}
        />
      ) : (
        <main className="container post-body">
          <h1>Publisher is preparing its first publication.</h1>
          <p>Published reporting will appear here after the first release.</p>
        </main>
      )}
    </SiteChrome>
  )
}

function FeaturedPost() {
  const featured = leadPost(posts)
  if (!featured) return null
  const author = getAuthor(featured.authorSlug)
  const path = getPostPath(featured)
  return (
    <article className="lead">
      <Link
        className="category"
        href={`/search/label/${featured.categories[0]}`}
      >
        {featured.categories[0]}
      </Link>
      <h1 className="lead-title">
        <Link href={path}>{featured.title}</Link>
      </h1>
      <p className="lead-excerpt">{featured.excerpt}</p>
      <p className="meta">
        By{' '}
        <Link href={`/author/${featured.authorSlug}/`}>
          {author?.name ?? featured.author}
        </Link>{' '}
        · {longDate(featured.publishedAt)}
      </p>
      {featured.imageUrl ? (
        <Link
          className="lead-figure"
          href={path}
          aria-hidden="true"
          tabIndex={-1}
        >
          <img src={featured.imageUrl} alt="" fetchPriority="high" />
        </Link>
      ) : null}
    </article>
  )
}
