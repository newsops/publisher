import type { Metadata } from 'next'
import { getPostsByCategory, publication, tags } from '@publisher/content'
import { notFound } from 'next/navigation'
import PostIndexPage from '../../../components/PostIndexPage'
import SiteChrome from '../../../components/SiteChrome'

const EMPTY_CATEGORY = { label: '__empty__' }

export function generateStaticParams() {
  const params = tags
    .filter((tag) => tag.active)
    .map((tag) => ({ label: tag.slug }))
  return params.length > 0 ? params : [EMPTY_CATEGORY]
}

function findTag(label: string) {
  return tags.find(
    (tag) => tag.active && tag.slug.toLowerCase() === label.toLowerCase(),
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ label: string }>
}): Promise<Metadata> {
  const { label } = await params
  const tag = findTag(label)
  return {
    title: `${tag?.name ?? label} | ${publication.name}`,
    description: `${publication.name} articles in the ${tag?.name ?? label} category.`,
    alternates: { canonical: `/search/label/${tag?.slug ?? label}/` },
  }
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ label: string }>
}) {
  const { label } = await params
  const tag = findTag(label)
  if (!tag) notFound()
  return (
    <SiteChrome>
      <PostIndexPage
        title={tag.name}
        allPosts={getPostsByCategory(tag.slug)}
        page={1}
        basePath={`/search/label/${tag.slug}`}
        category={tag.slug}
      />
    </SiteChrome>
  )
}
