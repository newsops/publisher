import {
  DESK_CHECKLIST,
  buildDeskReport,
  deskChecksPass,
  deskContentFingerprint,
  parseEditorialMarkdown,
  validateDeskChecklist,
  type DeskChecklistAttestation,
  type DeskImageFacts,
  type DeskReport,
  type DeskReview,
  type DeskReviewer,
  type ManagedPost,
} from '@publisher/content'
import {
  objectStoreFromEnvironment,
  PostgresMediaRepository,
  type MediaMetadata,
} from '@publisher/persistence'
import sharp from 'sharp'
import { getAgentGuidanceRepository } from './agent-guidance'
import { ApiRequestError } from './api-error'
import { getRepositoryForSite } from './repository'

/**
 * Desk review service (EDIT-001). Computes the report a desk sees before
 * approving a story and records the decision. Image facts come from the
 * media library and a pixel analysis so a placeholder or a repeated picture
 * is caught mechanically; everything else is the shared content contract.
 */

export interface DeskDecisionInput {
  readonly action: 'approve' | 'request-changes'
  readonly checklist?: readonly DeskChecklistAttestation[]
  readonly note?: string
}

export type DeskImageFactsResolver = (
  siteId: string,
  post: ManagedPost,
) => Promise<DeskImageFacts | undefined>

/** Pixel analysis shared by the resolver and tests: deviation and similarity. */
export async function analyseImagePixels(
  body: Uint8Array,
  compareWith?: Uint8Array,
): Promise<{
  readonly channelDeviation: number
  readonly duplicatesCompared?: boolean
}> {
  const stats = await sharp(body).stats()
  const channelDeviation =
    stats.channels.reduce((sum, channel) => sum + channel.stdev, 0) /
    stats.channels.length
  if (!compareWith) return { channelDeviation }
  const thumb = (source: Uint8Array) =>
    sharp(source).resize(32, 32, { fit: 'fill' }).greyscale().raw().toBuffer()
  const [left, right] = await Promise.all([thumb(body), thumb(compareWith)])
  let difference = 0
  for (let index = 0; index < left.length; index += 1)
    difference += Math.abs(left[index]! - right[index]!)
  return {
    channelDeviation,
    duplicatesCompared: difference / left.length < 8,
  }
}

function firstFigureSource(bodyMarkdown: string): string | undefined {
  try {
    const document = parseEditorialMarkdown(bodyMarkdown)
    const first = document.nodes[0]
    return first?.type === 'figure' ? document.figures[0]?.src : undefined
  } catch {
    return undefined
  }
}

function mediaByPublicPath(
  media: readonly MediaMetadata[],
  publicPath: string,
): MediaMetadata | undefined {
  return media.find(
    (item) =>
      item.state === 'approved' &&
      item.variants.some((variant) => variant.publicPath === publicPath),
  )
}

/** Media-library backed facts; without a library the facts are unverified. */
export const defaultImageFacts: DeskImageFactsResolver = async (
  siteId,
  post,
) => {
  if (!post.imageUrl) return undefined
  const databaseUrl = process.env.DATABASE_URL
  const store = objectStoreFromEnvironment()
  if (!databaseUrl || !store)
    return { found: true, verified: false, analysed: false }
  const media = await new PostgresMediaRepository(databaseUrl).list(siteId)
  const hero = mediaByPublicPath(media, post.imageUrl)
  if (!hero) return { found: false, analysed: false }
  try {
    const heroBody = await store.get(hero.objectKey)
    const figureSource = firstFigureSource(post.bodyMarkdown)
    const figure = figureSource
      ? mediaByPublicPath(media, figureSource)
      : undefined
    const figureBody =
      figure && figure.id !== hero.id
        ? await store.get(figure.objectKey)
        : undefined
    const analysis = await analyseImagePixels(heroBody, figureBody)
    return {
      found: true,
      width: hero.width,
      height: hero.height,
      channelDeviation: analysis.channelDeviation,
      duplicatesFirstFigure:
        figure && figure.id === hero.id
          ? true
          : (analysis.duplicatesCompared ?? false),
      analysed: true,
    }
  } catch {
    return {
      found: true,
      width: hero.width,
      height: hero.height,
      analysed: false,
    }
  }
}

async function siteGuidance(siteId: string): Promise<string | undefined> {
  if (!process.env.DATABASE_URL) return undefined
  try {
    const guidance = await getAgentGuidanceRepository().get(siteId)
    return guidance.instructions || undefined
  } catch {
    return undefined
  }
}

export async function deskReportFor(
  siteId: string,
  post: ManagedPost,
  resolveImage: DeskImageFactsResolver = defaultImageFacts,
): Promise<DeskReport> {
  const repository = getRepositoryForSite(siteId)
  const author = await repository.getAuthor(post.authorSlug)
  return buildDeskReport(post, {
    image: await resolveImage(siteId, post),
    authorActive: author?.active ?? false,
    guidance: await siteGuidance(siteId),
  })
}

export function parseDeskDecision(value: unknown): DeskDecisionInput {
  if (!value || typeof value !== 'object')
    throw new ApiRequestError('invalid_body', 'A JSON object is required', 400)
  const body = value as Record<string, unknown>
  if (body.action !== 'approve' && body.action !== 'request-changes')
    throw new ApiRequestError(
      'invalid_action',
      'action must be approve or request-changes',
      400,
    )
  const checklist = body.checklist
  if (
    checklist !== undefined &&
    (!Array.isArray(checklist) ||
      checklist.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          typeof (item as { id?: unknown }).id !== 'string' ||
          typeof (item as { checked?: unknown }).checked !== 'boolean' ||
          ((item as { note?: unknown }).note !== undefined &&
            typeof (item as { note?: unknown }).note !== 'string'),
      ))
  )
    throw new ApiRequestError(
      'invalid_field',
      'checklist must be an array of { id, checked, note? }',
      400,
    )
  if (body.note !== undefined && typeof body.note !== 'string')
    throw new ApiRequestError('invalid_field', 'note must be a string', 400)
  return {
    action: body.action,
    checklist: checklist as readonly DeskChecklistAttestation[] | undefined,
    note: body.note as string | undefined,
  }
}

export class DeskDecisionError extends ApiRequestError {
  constructor(
    code: 'desk_checks_failed' | 'desk_checklist_incomplete',
    message: string,
    readonly report: DeskReport,
  ) {
    super(code, message, 409)
  }
}

export async function decideDesk(
  siteId: string,
  postId: string,
  decision: DeskDecisionInput,
  reviewer: DeskReviewer,
  resolveImage: DeskImageFactsResolver = defaultImageFacts,
): Promise<{ readonly post: ManagedPost; readonly report: DeskReport }> {
  const repository = getRepositoryForSite(siteId)
  const current = await repository.get(postId)
  if (!current) throw new ApiRequestError('not_found', 'Post not found', 404)
  const now = new Date().toISOString()
  const fingerprint = deskContentFingerprint(current)
  if (decision.action === 'request-changes') {
    const post = await repository.reviewPost(postId, {
      status: 'changes_requested',
      contentFingerprint: fingerprint,
      checklist: decision.checklist ?? [],
      reviewer,
      note: decision.note,
      reviewedAt: now,
    })
    return { post, report: await deskReportFor(siteId, post, resolveImage) }
  }
  const report = await deskReportFor(siteId, current, resolveImage)
  if (!deskChecksPass(report.checks))
    throw new DeskDecisionError(
      'desk_checks_failed',
      `Automated checks failed: ${report.checks
        .filter((check) => check.level === 'fail')
        .map((check) => `${check.id} (${check.message})`)
        .join('; ')}`,
      report,
    )
  const attestations = decision.checklist ?? []
  const checklist = validateDeskChecklist(attestations)
  if (!checklist.ok)
    throw new DeskDecisionError(
      'desk_checklist_incomplete',
      `Every self-check item must be attested; missing: ${checklist.missing.join(', ')}`,
      report,
    )
  const known = new Set(DESK_CHECKLIST.map((item) => item.id))
  const review: DeskReview = {
    status: 'approved',
    contentFingerprint: fingerprint,
    checklist: attestations.filter((item) => known.has(item.id)),
    reviewer,
    note: decision.note,
    reviewedAt: now,
  }
  const post = await repository.reviewPost(postId, review)
  return { post, report: { ...report, review, approvalValid: true } }
}

export function deskReviewerFor(identity: {
  readonly subject: string
  readonly email: string
}): DeskReviewer {
  return identity.subject.startsWith('automation:')
    ? { kind: 'automation', id: identity.subject.slice('automation:'.length) }
    : { kind: 'account', id: identity.email || identity.subject }
}
