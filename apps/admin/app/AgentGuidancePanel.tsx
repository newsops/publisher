import type { AdminAgentGuidance } from './admin-model'

export default function AgentGuidancePanel({
  guidance,
  setGuidance,
  save,
}: Readonly<{
  guidance: AdminAgentGuidance
  setGuidance: (next: AdminAgentGuidance) => void
  save: () => Promise<void>
}>) {
  return (
    <section
      className="settings-panel"
      aria-labelledby="agent-guidance-heading"
    >
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
      <label htmlFor="agent-guidance">Editorial instructions</label>
      <textarea
        id="agent-guidance"
        rows={7}
        maxLength={12000}
        value={guidance.instructions}
        onChange={(event) =>
          setGuidance({ ...guidance, instructions: event.target.value })
        }
        placeholder="Example: Do not publish an article without a representative image."
      />
      <button className="secondary" type="button" onClick={() => void save()}>
        Save agent guidance
      </button>
    </section>
  )
}
