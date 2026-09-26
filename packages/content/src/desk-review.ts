import { createHash } from 'node:crypto'
import { parseEditorialMarkdown } from './editorial-markdown'
import type { NewsPost } from './types'

/**
 * Desk review contract (EDIT-001).
 *
 * A story cannot be published without a desk approval that is bound to a
 * fingerprint of its publish-relevant content. The desk sees a report with
 * deterministic automated checks (all must pass) and a self-check list (every
 * item must be attested). The record is private admin data and never enters
 * the public snapshot.
 */

export type DeskCheckLevel = 'pass' | 'warn' | 'fail'

export interface DeskCheck {
  readonly id: string
  readonly level: DeskCheckLevel
  readonly message: string
}

export interface DeskChecklistItem {
  readonly id: string
  readonly label: string
  readonly description: string
}

export interface DeskChecklistAttestation {
  readonly id: string
  readonly checked: boolean
  readonly note?: string
}

export type DeskReviewStatus = 'pending' | 'approved' | 'changes_requested'

export interface DeskReviewer {
  readonly kind: 'account' | 'automation' | 'fixture' | 'upgrade'
  readonly id: string
}

export interface DeskReview {
  readonly status: DeskReviewStatus
  /** Fingerprint of the content the decision applies to. */
  readonly contentFingerprint: string
  readonly checklist: readonly DeskChecklistAttestation[]
  readonly reviewer: DeskReviewer
  readonly note?: string
  readonly reviewedAt: string
}

/** Image facts supplied by the trusted boundary that can read media. */
export interface DeskImageFacts {
  readonly found: boolean
  /** False when no media library was available to confirm the image. */
  readonly verified?: boolean
  readonly width?: number
  readonly height?: number
  /** Standard deviation of pixel values across channels, 0–255. */
  readonly channelDeviation?: number
  /** Whether the first body figure is visually the same picture. */
  readonly duplicatesFirstFigure?: boolean
  readonly analysed: boolean
}

export interface DeskCheckContext {
  readonly image?: DeskImageFacts
  readonly authorActive?: boolean
  readonly guidance?: string
}

export interface DeskReport {
  readonly checks: readonly DeskCheck[]
  readonly checklist: readonly DeskChecklistItem[]
  readonly guidance?: string
  readonly contentFingerprint: string
  readonly review?: DeskReview
  readonly approvalValid: boolean
}

export const DESK_CHECKLIST: readonly DeskChecklistItem[] = [
  {
    id: 'facts-verified',
    label: 'Facts and sources verified',
    description:
      'Every claim is supported by a cited source that was actually consulted.',
  },
  {
    id: 'headline-accurate',
    label: 'Headline matches the story',
    description:
      'The headline and excerpt describe what the body reports, without exaggeration.',
  },
  {
    id: 'image-representative',
    label: 'Image represents the story and rights are cleared',
    description:
      'The representative image shows the subject of the story, is not a placeholder, and may be used by this publication.',
  },
  {
    id: 'seo-fields',
    label: 'SEO title and description read correctly',
    description:
      'Search titles and descriptions are complete sentences that describe this story.',
  },
  {
    id: 'taxonomy-author',
    label: 'Categories, tags, and author are right',
    description:
      'The story sits in the right sections and is attributed to the correct byline.',
  },
  {
    id: 'site-guidance',
    label: 'Site guidance followed',
    description:
      'The publication-specific editorial guidance shown in the report was read and applied.',
  },
]

export const DESK_LIMITS = {
  image: { minWidth: 1200, minHeight: 630, minAspect: 1.4, maxAspect: 2.0 },
  /** Below this channel deviation an image is effectively blank. */
  minChannelDeviation: 12,
  title: { min: 20, max: 110 },
  excerpt: { min: 40, max: 200 },
  seoTitle: { max: 70 },
  seoDescription: { min: 50, max: 160 },
  bodyMinWords: 150,
} as const

type DeskPostFields = Pick<
  NewsPost,
  | 'title'
  | 'excerpt'
  | 'bodyMarkdown'
  | 'imageUrl'
  | 'authorSlug'
  | 'categories'
  | 'tags'
  | 'seoTitle'
  | 'seoDescription'
>

/** Hash of the fields whose change must invalidate a desk approval. */
export function deskContentFingerprint(post: DeskPostFields): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        title: post.title,
        excerpt: post.excerpt,
        bodyMarkdown: post.bodyMarkdown,
        imageUrl: post.imageUrl ?? '',
        authorSlug: post.authorSlug,
        categories: [...post.categories],
        tags: [...(post.tags ?? [])],
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
      }),
    )
    .digest('hex')
}

/**
 * A fully attested approval for a post whose content is known to be
 * acceptable: the checked-in fixture and contract tests use it so the gate
 * is exercised without a live desk. Any later content edit invalidates it.
 */
export function deskFixtureApproval(
  post: DeskPostFields,
  reviewer: DeskReviewer = { kind: 'fixture', id: 'checked-in-fixture' },
  reviewedAt = '2026-01-01T00:00:00.000Z',
): DeskReview {
  return {
    status: 'approved',
    contentFingerprint: deskContentFingerprint(post),
    checklist: DESK_CHECKLIST.map((item) => ({ id: item.id, checked: true })),
    reviewer,
    reviewedAt,
  }
}

export function deskApprovalValid(
  post: DeskPostFields & { readonly deskReview?: DeskReview },
): boolean {
  return (
    post.deskReview?.status === 'approved' &&
    post.deskReview.contentFingerprint === deskContentFingerprint(post)
  )
}

function wordCount(markdown: string): number {
  return markdown
    .replace(/:::[\s\S]*?:::/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

function lengthCheck(
  id: string,
  label: string,
  value: string,
  min: number | undefined,
  max: number | undefined,
): DeskCheck {
  const length = value.trim().length
  if (min !== undefined && length < min)
    return {
      id,
      level: 'fail',
      message: `${label} has ${length} characters; at least ${min} are required`,
    }
  if (max !== undefined && length > max)
    return {
      id,
      level: 'fail',
      message: `${label} has ${length} characters; at most ${max} are allowed`,
    }
  return { id, level: 'pass', message: `${label} length is ${length}` }
}

function imageChecks(
  post: DeskPostFields,
  image: DeskImageFacts | undefined,
): DeskCheck[] {
  const limits = DESK_LIMITS.image
  if (!post.imageUrl)
    return [
      {
        id: 'image.present',
        level: 'fail',
        message: 'A representative image is required',
      },
    ]
  const checks: DeskCheck[] = [
    { id: 'image.present', level: 'pass', message: 'Representative image set' },
  ]
  if (!image || !image.found) {
    checks.push({
      id: 'image.resolved',
      level: 'fail',
      message: 'The representative image is not an approved media item',
    })
    return checks
  }
  checks.push(
    image.verified === false
      ? {
          id: 'image.resolved',
          level: 'warn',
          message:
            'No media library is available to verify the image; confirm it is an approved media item',
        }
      : {
          id: 'image.resolved',
          level: 'pass',
          message: 'Image found in the media library',
        },
  )
  if (image.width !== undefined && image.height !== undefined) {
    const aspect = image.width / image.height
    checks.push(
      image.width >= limits.minWidth && image.height >= limits.minHeight
        ? {
            id: 'image.size',
            level: 'pass',
            message: `Image is ${image.width}×${image.height}`,
          }
        : {
            id: 'image.size',
            level: 'fail',
            message: `Image is ${image.width}×${image.height}; at least ${limits.minWidth}×${limits.minHeight} is required`,
          },
      aspect >= limits.minAspect && aspect <= limits.maxAspect
        ? {
            id: 'image.aspect',
            level: 'pass',
            message: `Aspect ratio ${aspect.toFixed(2)}`,
          }
        : {
            id: 'image.aspect',
            level: 'fail',
            message: `Aspect ratio ${aspect.toFixed(2)} is outside ${limits.minAspect}–${limits.maxAspect}`,
          },
    )
  }
  if (!image.analysed) {
    checks.push({
      id: 'image.content',
      level: 'warn',
      message: 'Image pixels could not be analysed; confirm it visually',
    })
    return checks
  }
  if (image.channelDeviation !== undefined)
    checks.push(
      image.channelDeviation >= DESK_LIMITS.minChannelDeviation
        ? {
            id: 'image.content',
            level: 'pass',
            message: 'Image has visible content',
          }
        : {
            id: 'image.content',
            level: 'fail',
            message:
              'Image is nearly blank (a placeholder or a mostly empty frame); choose a representative picture',
          },
    )
  if (image.duplicatesFirstFigure !== undefined)
    checks.push(
      image.duplicatesFirstFigure
        ? {
            id: 'image.duplicate',
            level: 'fail',
            message:
              'The first body figure repeats the representative image; remove one of them',
          }
        : {
            id: 'image.duplicate',
            level: 'pass',
            message: 'Body figures do not repeat the representative image',
          },
    )
  return checks
}

/** Deterministic, provider-neutral desk checks. Every `fail` blocks approval. */
export function runDeskChecks(
  post: DeskPostFields,
  context: DeskCheckContext = {},
): DeskCheck[] {
  const checks: DeskCheck[] = [
    ...imageChecks(post, context.image),
    lengthCheck(
      'title.length',
      'Title',
      post.title,
      DESK_LIMITS.title.min,
      DESK_LIMITS.title.max,
    ),
    lengthCheck(
      'excerpt.length',
      'Excerpt',
      post.excerpt,
      DESK_LIMITS.excerpt.min,
      DESK_LIMITS.excerpt.max,
    ),
    lengthCheck(
      'seoTitle.length',
      'SEO title',
      post.seoTitle,
      undefined,
      DESK_LIMITS.seoTitle.max,
    ),
    lengthCheck(
      'seoDescription.length',
      'SEO description',
      post.seoDescription,
      DESK_LIMITS.seoDescription.min,
      DESK_LIMITS.seoDescription.max,
    ),
  ]
  let sources = 0
  try {
    const document = parseEditorialMarkdown(post.bodyMarkdown)
    checks.push({
      id: 'body.markdown',
      level: 'pass',
      message: 'Body follows the editorial Markdown contract',
    })
    sources =
      (post.bodyMarkdown.match(/\]\(https:\/\/[^)]+\)/g) ?? []).length +
      document.embeds.length
  } catch (error) {
    checks.push({
      id: 'body.markdown',
      level: 'fail',
      message: `Body is not valid editorial Markdown: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
  const words = wordCount(post.bodyMarkdown)
  checks.push(
    words >= DESK_LIMITS.bodyMinWords
      ? { id: 'body.length', level: 'pass', message: `Body has ${words} words` }
      : {
          id: 'body.length',
          level: 'fail',
          message: `Body has ${words} words; at least ${DESK_LIMITS.bodyMinWords} are required`,
        },
    sources > 0
      ? {
          id: 'body.sources',
          level: 'pass',
          message: `${sources} source link${sources === 1 ? '' : 's'} or embed${sources === 1 ? '' : 's'}`,
        }
      : {
          id: 'body.sources',
          level: 'fail',
          message: 'At least one HTTPS source link or X embed is required',
        },
  )
  if (context.authorActive !== undefined)
    checks.push(
      context.authorActive
        ? { id: 'author.active', level: 'pass', message: 'Author is active' }
        : {
            id: 'author.active',
            level: 'fail',
            message: 'The byline author is archived',
          },
    )
  checks.push(
    post.categories.length > 0
      ? {
          id: 'taxonomy.categories',
          level: 'pass',
          message: `${post.categories.length} categor${post.categories.length === 1 ? 'y' : 'ies'}`,
        }
      : {
          id: 'taxonomy.categories',
          level: 'fail',
          message: 'At least one category is required',
        },
  )
  checks.push(
    context.guidance?.trim()
      ? {
          id: 'site.guidance',
          level: 'pass',
          message: 'Site guidance available',
        }
      : {
          id: 'site.guidance',
          level: 'warn',
          message: 'No site guidance is configured for this publication',
        },
  )
  return checks
}

export function deskChecksPass(checks: readonly DeskCheck[]): boolean {
  return checks.every((check) => check.level !== 'fail')
}

/** Validates an attestation set against the platform checklist. */
export function validateDeskChecklist(
  attestations: readonly DeskChecklistAttestation[],
): { ok: true } | { ok: false; missing: readonly string[] } {
  const checked = new Set(
    attestations.filter((item) => item.checked).map((item) => item.id),
  )
  const missing = DESK_CHECKLIST.map((item) => item.id).filter(
    (id) => !checked.has(id),
  )
  return missing.length ? { ok: false, missing } : { ok: true }
}

export function buildDeskReport(
  post: DeskPostFields & { readonly deskReview?: DeskReview },
  context: DeskCheckContext = {},
): DeskReport {
  return {
    checks: runDeskChecks(post, context),
    checklist: DESK_CHECKLIST,
    guidance: context.guidance,
    contentFingerprint: deskContentFingerprint(post),
    review: post.deskReview,
    approvalValid: deskApprovalValid(post),
  }
}
