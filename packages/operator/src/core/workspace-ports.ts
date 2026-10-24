import type { InternalSyncWorkspace, Workspace } from './workspace-types'

const ports = new WeakMap<Workspace, InternalSyncWorkspace>()

export function publicWorkspaceView(port: InternalSyncWorkspace): Workspace {
  const view: Workspace = {
    status: () => port.status(),
    read: () => port.read(),
    execute: (request) => port.execute(request),
    close: () => port.close(),
  }
  ports.set(view, port)
  return view
}

export function workspaceSyncPort(workspace: Workspace): InternalSyncWorkspace {
  const port = ports.get(workspace)
  if (!port) throw new Error('Workspace has no internal synchronization port')
  return port
}
