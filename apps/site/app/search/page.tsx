import type { Metadata } from 'next'
import { getPostPath, posts, publication } from '@publisher/content'
import SearchResults from './SearchResults'
import SiteChrome from '../components/SiteChrome'

export const metadata: Metadata = {
  title: `Search | ${publication.name}`,
  robots: { index: false, follow: true },
}

export default function SearchPage() {
  const results = posts.map((post) => ({
    title: post.title,
    path: getPostPath(post),
    excerpt: post.excerpt,
    categories: post.categories,
    publishedAt: post.publishedAt,
    imageUrl: post.imageUrl,
  }))
  return (
    <SiteChrome>
      <main className="container post-body">
        <h1>Search</h1>
        <SearchResults posts={results} />
      </main>
    </SiteChrome>
  )
}
