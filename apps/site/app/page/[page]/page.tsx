import type { Metadata } from 'next'
import { posts, publication } from '@publisher/content'
import PostIndexPage, {
  leadPost,
  totalPages,
  trailingPosts,
} from '../../components/PostIndexPage'
import SiteChrome from '../../components/SiteChrome'

const feed = trailingPosts(posts)
const EMPTY_PAGE = { page: '2' }

export function generateStaticParams() {
  const params = Array.from(
    { length: totalPages(feed.length) },
    (_, index) => ({
      page: String(index + 1),
    }),
  ).filter(({ page }) => page !== '1')
  return params.length > 0 ? params : [EMPTY_PAGE]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>
}): Promise<Metadata> {
  const { page } = await params
  return {
    title: `Page ${page} | ${publication.name}`,
    alternates: { canonical: `/page/${page}/` },
  }
}

export default async function PaginatedHomePage({
  params,
}: {
  params: Promise<{ page: string }>
}) {
  const { page: rawPage } = await params
  const page = Number(rawPage)
  if (!Number.isInteger(page) || page < 2 || page > totalPages(feed.length))
    return null
  return (
    <SiteChrome>
      <PostIndexPage
        title={`More reporting · Page ${page}`}
        allPosts={feed}
        page={page}
        exclude={leadPost(posts)?.slug}
      />
    </SiteChrome>
  )
}
