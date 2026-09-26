import {
  articles,
  getArticleVariant,
  getArticleVariantPath,
  getAuthor,
  getPublishedVariants,
  publication,
} from '@publisher/content'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import StaticArticlePage from '../../../../../../components/StaticArticlePage'

export const dynamicParams = false
export const dynamic = 'force-static'
const EMPTY_VARIANT_SENTINEL = '__no-translation__'

export async function generateStaticParams() {
  const params = articles.flatMap((article) =>
    getPublishedVariants(article)
      .filter((variant) => variant.locale !== publication.locale)
      .map((variant) => ({
        locale: variant.locale,
        year: variant.publishedAt.slice(0, 4),
        month: variant.publishedAt.slice(5, 7),
        slug: variant.slug,
      })),
  )
  return params.length > 0
    ? params
    : [
        {
          locale: 'und',
          year: '1970',
          month: '01',
          slug: EMPTY_VARIANT_SENTINEL,
        },
      ]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; year: string; month: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const resolved = getArticleVariant(locale, slug)
  if (!resolved) return { title: `Article not found | ${publication.name}` }
  const { article, variant } = resolved
  const path = getArticleVariantPath(article, variant)
  return {
    title: `${variant.seoTitle} | ${publication.name}`,
    description: variant.seoDescription,
    alternates: {
      canonical: path,
      languages: Object.fromEntries(
        getPublishedVariants(article).map((candidate) => [
          candidate.locale,
          getArticleVariantPath(article, candidate),
        ]),
      ),
    },
    openGraph: {
      type: 'article',
      title: variant.seoTitle,
      description: variant.seoDescription,
      url: path,
      publishedTime: variant.publishedAt,
      modifiedTime: variant.updatedAt,
    },
  }
}

export default async function LocalizedPostPage({
  params,
}: {
  params: Promise<{ locale: string; year: string; month: string; slug: string }>
}) {
  const { locale, slug } = await params
  const resolved = getArticleVariant(locale, slug)
  if (!resolved) notFound()
  const { article, variant } = resolved
  const author = getAuthor(article.authorSlug)
  return (
    <StaticArticlePage
      article={{
        title: variant.title,
        description: variant.seoDescription,
        bodyHtml: variant.bodyHtml,
        publishedAt: variant.publishedAt,
        updatedAt: variant.updatedAt,
        authorName: author?.name ?? article.author,
        authorSlug: article.authorSlug,
        categories: article.categories,
        canonicalPath: getArticleVariantPath(article, variant),
        imageUrl: article.imageUrl,
        language: variant.locale,
        languages: getPublishedVariants(article).map((candidate) => ({
          locale: candidate.locale,
          path: getArticleVariantPath(article, candidate),
        })),
      }}
    />
  )
}
