import type { Metadata } from 'next'
import { getPostsByCategory, publication, tags } from '@publisher/content'
import { notFound } from 'next/navigation'
import PostIndexPage, {
  totalPages,
} from '../../../../../components/PostIndexPage'
import SiteChrome from '../../../../../components/SiteChrome'

const EMPTY_CATEGORY_PAGE = { label: '__empty__', page: '2' }

export function generateStaticParams() {
  const params = tags
    .filter((tag) => tag.active)
    .flatMap((tag) =>
      Array.from(
        { length: totalPages(getPostsByCategory(tag.slug).length) },
        (_, index) => ({ label: tag.slug, page: String(index + 1) }),
      ).filter(({ page }) => page !== '1'),
    )
  return params.length > 0 ? params : [EMPTY_CATEGORY_PAGE]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ label: string; page: string }>
}): Promise<Metadata> {
  const { label, page } = await params
  const tag = tags.find(
    (candidate) =>
      candidate.active && candidate.slug.toLowerCase() === label.toLowerCase(),
  )
  return {
    title: `${tag?.name ?? label} · Page ${page} | ${publication.name}`,
    alternates: {
      canonical: `/search/label/${tag?.slug ?? label}/page/${page}/`,
    },
  }
}

export default async function PaginatedCategoryPage({
  params,
}: {
  params: Promise<{ label: string; page: string }>
}) {
  const { label, page: rawPage } = await params
  const tag = tags.find(
    (candidate) =>
      candidate.active && candidate.slug.toLowerCase() === label.toLowerCase(),
  )
  const page = Number(rawPage)
  if (!tag || !Number.isInteger(page) || page < 2) notFound()
  const categoryPosts = getPostsByCategory(tag.slug)
  if (page > totalPages(categoryPosts.length)) notFound()
  return (
    <SiteChrome>
      <PostIndexPage
        title={`${tag.name} · Page ${page}`}
        allPosts={categoryPosts}
        page={page}
        basePath={`/search/label/${tag.slug}`}
        category={tag.slug}
      />
    </SiteChrome>
  )
}
