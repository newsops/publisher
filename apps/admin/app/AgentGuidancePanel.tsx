import type { ReactElement } from 'react'
import {
  useAgentGuidanceEditor,
  type AgentGuidancePanelProps,
} from './useAgentGuidanceEditor'
import {
  GuidanceConflict,
  GuidanceDraftField,
  GuidanceIntroduction,
  GuidanceMachineContext,
  GuidanceSaveActions,
} from './AgentGuidanceFields'

export default function AgentGuidancePanel(
  props: Readonly<AgentGuidancePanelProps>,
): ReactElement {
  const editor = useAgentGuidanceEditor(props)
  const loaded = props.guidance.revision > 0
  return (
    <section
      className="settings-panel"
      aria-labelledby="agent-guidance-heading"
    >
      <GuidanceIntroduction guidance={props.guidance} />
      <GuidanceDraftField
        guidance={props.guidance}
        setGuidance={props.setGuidance}
        busy={editor.busy}
      />
      <GuidanceSaveActions editor={editor} loaded={loaded} />
      {editor.conflict && (
        <GuidanceConflict
          guidance={editor.conflict}
          reload={editor.reloadConflict}
          reapply={editor.reapplyDraft}
        />
      )}
      <GuidanceMachineContext editor={editor} loaded={loaded} />
    </section>
  )
}
