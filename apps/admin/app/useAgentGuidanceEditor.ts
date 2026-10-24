import { useRef, useState } from 'react'
import type { AdminAgentGuidance, GuidanceSaveResult } from './admin-model'

export interface AgentGuidancePanelProps {
  guidance: AdminAgentGuidance
  setGuidance: (next: AdminAgentGuidance) => void
  save: () => Promise<GuidanceSaveResult>
  reload: () => Promise<AdminAgentGuidance | undefined>
}

function useGuidanceState(guidance: AdminAgentGuidance) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<AdminAgentGuidance>()
  const context = useRef<HTMLTextAreaElement>(null)
  return {
    status,
    setStatus,
    busy,
    setBusy,
    conflict,
    setConflict,
    context,
    preview: JSON.stringify({ agentContext: guidance }, null, 2),
  }
}

type Editor = AgentGuidancePanelProps & ReturnType<typeof useGuidanceState>
export type AgentGuidanceEditor = ReturnType<typeof useGuidanceState> & {
  saveDraft: () => Promise<void>
  compareServerVersion: () => Promise<void>
  copyContext: () => Promise<void>
  reloadConflict: () => void
  reapplyDraft: () => void
}

async function saveDraft(editor: Editor): Promise<void> {
  editor.setBusy(true)
  try {
    const result = await editor.save()
    if (result.kind === 'conflict') {
      editor.setStatus(
        'The server changed. Your draft is preserved. Compare the latest version, then reload it or reapply your draft.',
      )
      editor.setConflict(await editor.reload())
    } else if (result.kind === 'saved') {
      editor.setConflict(undefined)
      editor.setStatus('Agent guidance saved.')
    } else editor.setStatus('Unable to save. Your draft is preserved.')
  } catch {
    editor.setStatus('Unable to reach the server. Your draft is preserved.')
  } finally {
    editor.setBusy(false)
  }
}

async function compareServerVersion(editor: Editor): Promise<void> {
  editor.setBusy(true)
  try {
    const latest = await editor.reload()
    editor.setConflict(latest)
    editor.setStatus(
      latest
        ? 'Your draft is preserved. Compare it with the latest server version.'
        : 'Unable to load the server version. Your draft is preserved.',
    )
  } catch {
    editor.setStatus(
      'Unable to load the server version. Your draft is preserved.',
    )
  } finally {
    editor.setBusy(false)
  }
}

async function copyContext(editor: Editor): Promise<void> {
  try {
    await navigator.clipboard.writeText(editor.preview)
    editor.setStatus('Machine context copied.')
  } catch {
    editor.context.current?.focus()
    editor.context.current?.select()
    editor.setStatus('Copy the selected machine context.')
  }
}

function resolveConflict(editor: Editor, action: 'reload' | 'reapply'): void {
  if (!editor.conflict) return
  editor.setGuidance(
    action === 'reload'
      ? editor.conflict
      : {
          ...editor.conflict,
          instructions: editor.guidance.instructions,
        },
  )
  editor.setConflict(undefined)
  editor.setStatus(
    action === 'reload'
      ? 'Loaded server version. The previous draft was discarded by your choice.'
      : 'Your draft is applied to the latest revision. Review it and save explicitly.',
  )
}

export function useAgentGuidanceEditor(
  props: AgentGuidancePanelProps,
): AgentGuidanceEditor {
  const state = useGuidanceState(props.guidance)
  const editor = { ...props, ...state }
  return {
    ...state,
    saveDraft: () => saveDraft(editor),
    compareServerVersion: () => compareServerVersion(editor),
    copyContext: () => copyContext(editor),
    reloadConflict: () => resolveConflict(editor, 'reload'),
    reapplyDraft: () => resolveConflict(editor, 'reapply'),
  }
}
