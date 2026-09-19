import {
  DESK_CHECKLIST,
  buildDeskReport,
  deskChecksPass,
  deskContentFingerprint,
  validateDeskChecklist,
  type DeskChecklistAttestation,
  type DeskImageFacts,
  type DeskReport,
  type DeskReview,
  type DeskReviewer,
  type ManagedPost,
} from '@publisher/content'
import { ServiceError as ApiRequestError } from './errors'
import { getRepositoryForSite } from '../repository'

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

/** Adapter-provided facts the desk service needs; wired in `lib/index.ts`. */
export interface DeskDependencies {
  readonly resolveImage: DeskImageFactsResolver
  readonly guidanceFor: (siteId: string) => Promise<string | undefined>
}

export async function deskReportFor(
  siteId: string,
  post: ManagedPost,
  dependencies: DeskDependencies,
): Promise<DeskReport> {
  const repository = getRepositoryForSite(siteId)
  const author = await repository.getAuthor(post.authorSlug)
  return buildDeskReport(post, {
    image: await dependencies.resolveImage(siteId, post),
    authorActive: author?.active ?? false,
    guidance: await dependencies.guidanceFor(siteId),
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
  dependencies: DeskDependencies,
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
    return { post, report: await deskReportFor(siteId, post, dependencies) }
  }
  const report = await deskReportFor(siteId, current, dependencies)
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
