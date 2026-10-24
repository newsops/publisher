/** Content mutations share one fail-closed, selected-site planning preflight. */
const contentMutations = new Set([
  'createPost',
  'updatePost',
  'deletePost',
  'putArticleVariant',
  'deleteArticleVariant',
  'uploadMedia',
  'approveMedia',
  'restoreContent',
  'publish',
  'decideDesk',
  'createAuthor',
  'updateAuthor',
  'archiveAuthor',
  'createCategory',
  'updateCategory',
  'archiveCategory',
  'createTag',
  'updateTag',
  'archiveTag',
])

export class AgentContextUnavailableError extends Error {
  constructor() {
    super('Agent context unavailable')
  }
}

export function withAgentGuidance(api, onContext) {
  const contexts = new Map()
  const getAgentGuidance = async (siteId) => {
    if (contexts.has(siteId)) return contexts.get(siteId)
    const response = await api.getAgentGuidance(siteId)
    const context = response.data?.agentContext
    if (
      response.data?.siteId !== siteId ||
      !context ||
      typeof context.instructions !== 'string' ||
      context.instructions.length > 12_000 ||
      !Number.isSafeInteger(context.revision) ||
      context.revision < 1
    ) {
      throw new AgentContextUnavailableError()
    }
    const safe = {
      status: response.status,
      data: {
        siteId,
        agentContext: {
          instructions: context.instructions,
          revision: context.revision,
          ...(typeof context.updatedAt === 'string'
            ? { updatedAt: context.updatedAt }
            : {}),
        },
      },
    }
    contexts.set(siteId, safe)
    onContext(safe.data.agentContext)
    return safe
  }
  return {
    ...api,
    ...Object.fromEntries(
      [...contentMutations].map((name) => [
        name,
        async (siteId, ...input) => {
          await getAgentGuidance(siteId)
          return api[name](siteId, ...input)
        },
      ]),
    ),
    getAgentGuidance,
  }
}
