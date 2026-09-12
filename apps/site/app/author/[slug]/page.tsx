import {
  authors,
  getAuthor,
  getPostsByAuthor,
  publication,
} from '@publisher/content'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '../../components/JsonLd'
import PostIndexPage from '../../components/PostIndexPage'
import SiteChrome from '../../components/SiteChrome'

const EMPTY_AUTHOR = { slug: '__empty__' }

export function generateStaticParams() {
  const params = authors
    .filter((author) => author.active)
    .map(({ slug }) => ({ slug }))
  return params.length > 0 ? params : [EMPTY_AUTHOR]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const author = getAuthor(slug)
  if (!author?.active)
    return { title: `Author not found | ${publication.name}` }
  return {
    title: `${author.name} | ${publication.name}`,
    description: author.bio,
    alternates: { canonical: `/author/${author.slug}/` },
  }
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const author = getAuthor(slug)
  if (!author?.active) notFound()
  return (
    <SiteChrome>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: author.name,
          description: author.bio,
          url: `${publication.canonicalOrigin}/author/${author.slug}/`,
        }}
      />
      <section className="container author-profile">
        <p className="category">Author</p>
        <h1>{author.name}</h1>
        <p>{author.bio}</p>
      </section>
      <PostIndexPage
        title={`Articles by ${author.name}`}
        allPosts={getPostsByAuthor(author.slug)}
        page={1}
      />
    </SiteChrome>
  )
}
