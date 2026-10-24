import type { PublicationInputs } from '../../packages/publication/src/index'

type CommentRuntime = NonNullable<PublicationInputs['commentRuntime']>
type HumanVerification = NonNullable<CommentRuntime['humanVerification']>

function verificationOrigins(
  value: string | undefined,
  name: string,
): readonly string[] {
  if (value === undefined)
    throw new Error(
      `${name} requires an explicit JSON origin array; use [] when none are needed`,
    )
  const parsed: unknown = JSON.parse(value)
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item): item is string => typeof item === 'string')
  )
    throw new Error(`${name} must be a JSON array of exact public origins`)
  return parsed
}

function humanVerificationFromEnvironment(): HumanVerification | undefined {
  const siteKey = process.env.HUMAN_VERIFICATION_SITE_KEY?.trim()
  const scriptUrl = process.env.HUMAN_VERIFICATION_SCRIPT_URL?.trim()
  const globalName = process.env.HUMAN_VERIFICATION_GLOBAL?.trim()
  if (!siteKey && !scriptUrl && !globalName) return undefined
  if (!siteKey || !scriptUrl || !globalName)
    throw new Error(
      'Human verification requires public site key, script URL and browser global',
    )
  return {
    siteKey,
    scriptUrl,
    globalName,
    frameOrigins: verificationOrigins(
      process.env.HUMAN_VERIFICATION_FRAME_ORIGINS,
      'HUMAN_VERIFICATION_FRAME_ORIGINS',
    ),
    connectOrigins: verificationOrigins(
      process.env.HUMAN_VERIFICATION_CONNECT_ORIGINS,
      'HUMAN_VERIFICATION_CONNECT_ORIGINS',
    ),
  }
}

function submissionEnabledFromEnvironment(): boolean {
  const value = process.env.COMMENTS_SUBMISSION_ENABLED
  if (value === undefined) return false
  if (value !== 'true' && value !== 'false')
    throw new Error(
      'COMMENTS_SUBMISSION_ENABLED must be exactly true or false when supplied',
    )
  return value === 'true'
}

export function commentRuntimeFromEnvironment(
  siteId: string,
): CommentRuntime | undefined {
  const origin = process.env.COMMENTS_PUBLIC_ORIGIN?.trim()
  const submissionEnabled = submissionEnabledFromEnvironment()
  if (!origin) {
    if (submissionEnabled)
      throw new Error(
        'COMMENTS_SUBMISSION_ENABLED requires COMMENTS_PUBLIC_ORIGIN and human-verification public configuration',
      )
    return undefined
  }
  const humanVerification = humanVerificationFromEnvironment()
  if (submissionEnabled && !humanVerification)
    throw new Error(
      'COMMENTS_SUBMISSION_ENABLED requires complete human-verification public configuration',
    )
  return {
    origin: origin.replace(/\/$/, ''),
    siteId,
    submissionEnabled,
    ...(humanVerification ? { humanVerification } : {}),
  }
}
