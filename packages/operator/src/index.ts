import { assertSiteId, emptyPayload, isThemeId } from '@publisher/content'
import { createSqlite, openSqlite } from './adapters/sqlite-schema'
import { SqliteWorkspaceStore } from './adapters/sqlite-workspace'
import { workspaceFromStore } from './core/workspace'
import { WorkspaceError } from './contracts/errors'
import type {
  Workspace,
  WorkspaceIdentity,
  WorkspaceLocation,
} from './core/workspace-types'

function validateLocation(input: WorkspaceLocation): void {
  assertSiteId(input.siteId)
  if (!input.path || !input.writerId.trim())
    throw new WorkspaceError(
      'VALIDATION',
      'workspace path and writer identity are required',
    )
}

function parseOrigin(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new WorkspaceError(
      'VALIDATION',
      'valid workspace publication identity is required',
    )
  }
}

export function createWorkspace(
  input: WorkspaceLocation & { readonly identity: WorkspaceIdentity },
): Workspace {
  validateLocation(input)
  const origin = parseOrigin(input.identity.canonicalOrigin)
  if (
    !input.identity.name.trim() ||
    !isThemeId(input.identity.themeId) ||
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new WorkspaceError(
      'VALIDATION',
      'valid workspace publication identity is required',
    )
  const content = emptyPayload(input.siteId, input.identity)
  const store = new SqliteWorkspaceStore(
    createSqlite(input.path, input.siteId, input.writerId, {
      content,
      guidance: '',
    }),
    input.path,
  )
  return workspaceFromStore(store, input.writerId)
}

export function openWorkspace(input: WorkspaceLocation): Workspace {
  validateLocation(input)
  const store = new SqliteWorkspaceStore(openSqlite(input), input.path)
  try {
    store.readState()
    return workspaceFromStore(store, input.writerId)
  } catch (error) {
    store.close()
    throw error
  }
}

export { WorkspaceError } from './contracts/errors'
export type {
  MutationReceipt,
  MutationRequest,
  Workspace,
  WorkspaceCommand,
  WorkspaceContent,
  WorkspaceIdentity,
  WorkspaceLocation,
  WorkspaceRead,
  WorkspaceStatus,
} from './core/workspace-types'
