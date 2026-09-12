export function validatePopularityProjection(value: {
  readonly source?: string
  readonly window?: string
  readonly generatedAt?: string
  readonly policyApproved?: boolean
  readonly slugs: readonly string[]
}): void {
  if (
    !value.source?.trim() ||
    !value.window?.trim() ||
    !value.generatedAt ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    value.policyApproved !== true
  )
    throw new Error(
      'Popular projection requires source, window, generatedAt, and approved policy',
    )
}

export function sanitizeCommentProjection(
  comments: readonly {
    readonly id: string
    readonly authorName: string
    readonly body: string
    readonly status: 'pending' | 'approved' | 'rejected'
    readonly createdAt: string
  }[],
): readonly {
  readonly id: string
  readonly authorName: string
  readonly body: string
  readonly createdAt: string
}[] {
  const plain = (value: string) =>
    value
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  return comments
    .filter((comment) => comment.status === 'approved')
    .map((comment) => ({
      id: comment.id,
      authorName: plain(comment.authorName).slice(0, 80),
      body: plain(comment.body).slice(0, 2_000),
      createdAt: comment.createdAt,
    }))
    .filter((comment) => comment.authorName && comment.body)
}
