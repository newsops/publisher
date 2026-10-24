import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicationInputs } from '../../deploy/publication-worker-core.ts'
import { createPublicationRecipes } from '../../../packages/publication/src/index.ts'

afterEach(() => vi.unstubAllEnvs())

function configure(overrides = {}) {
  const values = {
    COMMENTS_PUBLIC_ORIGIN: 'https://comments.example.com',
    COMMENTS_SUBMISSION_ENABLED: 'true',
    HUMAN_VERIFICATION_SITE_KEY: 'public-fixture-key',
    HUMAN_VERIFICATION_SCRIPT_URL: 'https://verification.example.com/widget.js',
    HUMAN_VERIFICATION_GLOBAL: 'verification',
    HUMAN_VERIFICATION_FRAME_ORIGINS: '["https://frames.example.com"]',
    HUMAN_VERIFICATION_CONNECT_ORIGINS: '[]',
    ...overrides,
  }
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value)
}

const snapshot = {
  siteId: 'default',
  generatedAt: '2026-09-11T00:00:00.000Z',
  settings: {
    name: 'Example News',
    canonicalOrigin: 'https://example.com',
    language: 'en',
    themeId: 'editorial',
  },
  authors: [],
  tags: [],
  posts: [],
  media: [],
  adapters: { schemaVersion: 2, installations: [] },
}
const store = {
  get: async () => {
    throw new Error('No media expected')
  },
}

describe('publication worker public runtime boundary', () => {
  it('carries explicit frame/connect capabilities without inferring the script origin', async () => {
    configure()
    const input = await publicationInputs(snapshot, store)
    expect(input.commentRuntime.humanVerification.frameOrigins).toEqual([
      'https://frames.example.com',
    ])
    expect(input.commentRuntime.humanVerification.connectOrigins).toEqual([])
    const graph = createPublicationRecipes(input)
    expect(graph.dependencies['headers:csp']).toContain(
      "frame-src 'self' https://frames.example.com",
    )
    expect(graph.dependencies['headers:csp']).toContain(
      "connect-src 'self' https://comments.example.com;",
    )
  })

  it('rejects missing or malformed capability arrays rather than silently disabling comments', async () => {
    for (const value of [undefined, '{}', '[42]', 'invalid']) {
      configure({ HUMAN_VERIFICATION_FRAME_ORIGINS: value })
      await expect(publicationInputs(snapshot, store)).rejects.toThrow()
    }
    configure({ HUMAN_VERIFICATION_CONNECT_ORIGINS: undefined })
    await expect(publicationInputs(snapshot, store)).rejects.toThrow(
      'HUMAN_VERIFICATION_CONNECT_ORIGINS',
    )
  })

  it('permits read-only comments with no verification provider', async () => {
    configure({
      COMMENTS_SUBMISSION_ENABLED: 'false',
      HUMAN_VERIFICATION_SITE_KEY: undefined,
      HUMAN_VERIFICATION_SCRIPT_URL: undefined,
      HUMAN_VERIFICATION_GLOBAL: undefined,
      HUMAN_VERIFICATION_FRAME_ORIGINS: undefined,
      HUMAN_VERIFICATION_CONNECT_ORIGINS: undefined,
    })
    const input = await publicationInputs(snapshot, store)
    expect(input.commentRuntime.submissionEnabled).toBe(false)
    expect(() => createPublicationRecipes(input)).not.toThrow()
  })

  it('rejects every supplied non-boolean submission flag instead of disabling comments', async () => {
    for (const value of ['TRUE', 'yes', '1', '', ' ', ' true ', 'False']) {
      configure({ COMMENTS_SUBMISSION_ENABLED: value })
      await expect(publicationInputs(snapshot, store)).rejects.toThrow(
        'COMMENTS_SUBMISSION_ENABLED',
      )
    }
    configure({ COMMENTS_SUBMISSION_ENABLED: undefined })
    expect(
      (await publicationInputs(snapshot, store)).commentRuntime
        .submissionEnabled,
    ).toBe(false)
  })
})
