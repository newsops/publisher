import {
  getAuthor,
  getArticleVariant,
  getArticleVariantPath,
  getPublishedVariants,
  getPost,
  getPostPath,
  posts,
  publication,
} from '@publisher/content'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import StaticArticlePage from '../../../components/StaticArticlePage'

const EMPTY_ARTICLE = { year: '1970', month: '01', slug: '__empty__' }

export function generateStaticParams() {
  const params = posts.map((post) => ({
    year: post.publishedAt.slice(0, 4),
    month: post.publishedAt.slice(5, 7),
    slug: post.slug,
  }))
  return params.length > 0 ? params : [EMPTY_ARTICLE]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; month: string; slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return { title: `Article not found | ${publication.name}` }
  const path = getPostPath(post)
  const resolved = getArticleVariant(publication.locale, slug)
  const languages = resolved
    ? Object.fromEntries(
        getPublishedVariants(resolved.article).map((variant) => [
          variant.locale,
          getArticleVariantPath(resolved.article, variant),
        ]),
      )
    : undefined
  return {
    title: `${post.seoTitle} | ${publication.name}`,
    description: post.seoDescription,
    alternates: { canonical: path, languages },
    openGraph: {
      type: 'article',
      title: post.seoTitle,
      description: post.seoDescription,
      url: path,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author],
      images: post.imageUrl ? [{ url: post.imageUrl }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seoTitle,
      description: post.seoDescription,
      images: post.imageUrl ? [post.imageUrl] : undefined,
    },
  }
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ year: string; month: string; slug: string }>
}) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()
  const resolved = getArticleVariant(publication.locale, slug)
  const author = getAuthor(post.authorSlug)
  const languages = resolved
    ? getPublishedVariants(resolved.article).map((variant) => ({
        locale: variant.locale,
        path: getArticleVariantPath(resolved.article, variant),
      }))
    : undefined
  return (
    <StaticArticlePage
      article={{
        title: post.title,
        description: post.seoDescription,
        bodyHtml: post.bodyHtml,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
        authorName: author?.name ?? post.author,
        authorSlug: post.authorSlug,
        categories: post.categories,
        canonicalPath: getPostPath(post),
        imageUrl: post.imageUrl,
        languages,
        commentSlug: post.slug,
        showRecent: true,
      }}
    />
  )
}
