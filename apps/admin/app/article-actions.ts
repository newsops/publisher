import type { Dispatch, SetStateAction } from 'react'
import { adminFetch } from './admin-client'
import type {
  AdminArticle,
  AdminArticleVariant,
  AdminPost,
} from './admin-model'

type Setter<Value> = Dispatch<SetStateAction<Value>>

export async function loadArticle(
  post: AdminPost,
  setArticle: Setter<AdminArticle | undefined>,
  setLocale: Setter<string>,
): Promise<void> {
  if (!post.sourceId) {
    setArticle(undefined)
    return
  }
  const response = await adminFetch(
    `/api/articles/article-${encodeURIComponent(post.sourceId)}`,
  )
  if (!response.ok) {
    setArticle(undefined)
    return
  }
  const data = (await response.json()) as { article: AdminArticle }
  setArticle(data.article)
  setLocale(data.article.variants[0]?.locale ?? '')
}

export async function saveArticleVariant(
  article: AdminArticle,
  variant: AdminArticleVariant,
  setArticle: Setter<AdminArticle | undefined>,
  setMessage: Setter<string>,
): Promise<void> {
  const response = await adminFetch(
    `/api/articles/${encodeURIComponent(article.id)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': String(article.revision),
      },
      body: JSON.stringify(variant),
    },
  )
  const data = (await response.json().catch(() => ({}))) as {
    article?: AdminArticle
    error?: { message?: string }
  }
  setMessage(
    response.ok
      ? '언어 변형을 저장했습니다.'
      : `변형 저장 실패: ${data.error?.message ?? response.status}`,
  )
  if (response.ok && data.article) setArticle(data.article)
}

export async function removeArticleVariant(
  article: AdminArticle,
  locale: string,
  setArticle: Setter<AdminArticle | undefined>,
  setMessage: Setter<string>,
): Promise<void> {
  const response = await adminFetch(
    `/api/articles/${encodeURIComponent(article.id)}?locale=${encodeURIComponent(locale)}`,
    {
      method: 'DELETE',
      headers: { 'If-Match': String(article.revision) },
    },
  )
  const data = (await response.json().catch(() => ({}))) as {
    article?: AdminArticle
    error?: { message?: string }
  }
  setMessage(
    response.ok
      ? '언어 변형을 삭제했습니다.'
      : `변형 삭제 실패: ${data.error?.message ?? response.status}`,
  )
  if (response.ok && data.article) setArticle(data.article)
}
