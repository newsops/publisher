interface DatedSlug {
  readonly publishedAt: string
  readonly slug: string
}

export function publicPostPath(post: DatedSlug): string {
  return `/${post.publishedAt.slice(0, 4)}/${post.publishedAt.slice(5, 7)}/${post.slug}.html`
}

export function publicArchiveMonthPath(publishedAt: string): string {
  return `/${publishedAt.slice(0, 4)}/${publishedAt.slice(5, 7)}/`
}

export function publicAuthorPath(slug: string): string {
  return `/author/${encodeURIComponent(slug)}/`
}

export function publicCategoryPath(slug: string): string {
  return `/search/label/${encodeURIComponent(slug)}/`
}
