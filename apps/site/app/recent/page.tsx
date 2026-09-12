import { posts } from '@publisher/content'
import PostIndexPage from '../components/PostIndexPage'
import SiteChrome from '../components/SiteChrome'

export const metadata = {
  title: 'Recent stories',
  description: 'The latest published stories.',
  alternates: { canonical: '/recent/' },
}

export default function RecentPage() {
  return (
    <SiteChrome>
      <PostIndexPage title="Recent stories" allPosts={posts} page={1} />
    </SiteChrome>
  )
}
