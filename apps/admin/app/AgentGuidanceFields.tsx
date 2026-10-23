import type { ReactElement } from 'react'
import type { AdminAgentGuidance } from './admin-model'
import type {
  AgentGuidanceEditor,
  AgentGuidancePanelProps,
} from './useAgentGuidanceEditor'

export function GuidanceIntroduction({
  guidance,
}: Pick<AgentGuidancePanelProps, 'guidance'>): ReactElement {
  return (
    <>
      <div className="settings-heading">
        <div>
          <p className="eyebrow">Agent operations</p>
          <h2 id="agent-guidance-heading">Agent guidance</h2>
        </div>
        <small>r{guidance.revision || '—'}</small>
      </div>
      <p>
        Private instructions supplied to CLI/API agents before content changes.
        They never appear in the public site.
      </p>
      {guidance.revision < 1 && (
        <p>
          Guidance has not loaded. Compare the latest server version to retry
          before editing or saving.
        </p>
      )}
      {guidance.revision > 0 && !guidance.instructions && (
        <p>
          No editorial instructions are configured. Empty guidance does not
          bypass validation or authorization.
        </p>
      )}
    </>
  )
}

export function GuidanceDraftField({
  guidance,
  setGuidance,
  busy,
}: Pick<AgentGuidancePanelProps, 'guidance' | 'setGuidance'> &
  Pick<AgentGuidanceEditor, 'busy'>): ReactElement {
  return (
    <>
      <label htmlFor="agent-guidance">Editorial instructions</label>
      <textarea
        id="agent-guidance"
        rows={7}
        maxLength={12000}
        disabled={busy || guidance.revision < 1}
        value={guidance.instructions}
        onChange={(event) =>
          setGuidance({ ...guidance, instructions: event.target.value })
        }
        placeholder="Example: Do not publish an article without a representative image."
      />
    </>
  )
}

export function GuidanceSaveActions({
  editor,
  loaded,
}: Readonly<{ editor: AgentGuidanceEditor; loaded: boolean }>): ReactElement {
  return (
    <>
      <button
        className="secondary"
        type="button"
        disabled={editor.busy || !loaded}
        onClick={() => void editor.saveDraft()}
      >
        Save agent guidance
      </button>
      <button
        type="button"
        className="secondary"
        disabled={editor.busy}
        onClick={() => void editor.compareServerVersion()}
      >
        Compare latest server version
      </button>
    </>
  )
}

export function GuidanceConflict({
  guidance,
  reload,
  reapply,
}: Readonly<{
  guidance: AdminAgentGuidance
  reload: () => void
  reapply: () => void
}>): ReactElement {
  return (
    <div role="group" aria-label="Resolve guidance conflict">
      <label htmlFor="latest-agent-guidance">
        Latest server instructions (r{guidance.revision})
      </label>
      <textarea
        id="latest-agent-guidance"
        readOnly
        rows={5}
        value={guidance.instructions}
      />
      <button type="button" onClick={reload}>
        Reload server version
      </button>
      <button type="button" onClick={reapply}>
        Reapply my draft
      </button>
    </div>
  )
}

export function GuidanceMachineContext({
  editor,
  loaded,
}: Readonly<{ editor: AgentGuidanceEditor; loaded: boolean }>): ReactElement {
  return (
    <>
      <label htmlFor="agent-context-preview">
        Machine-facing context (includes unsaved edits)
      </label>
      <textarea
        id="agent-context-preview"
        ref={editor.context}
        readOnly
        rows={8}
        value={editor.preview}
      />
      <button
        type="button"
        className="secondary"
        onClick={() => void editor.copyContext()}
        disabled={!loaded}
      >
        Copy machine context
      </button>
      <p role="status" aria-live="polite">
        {editor.status}
      </p>
    </>
  )
}
