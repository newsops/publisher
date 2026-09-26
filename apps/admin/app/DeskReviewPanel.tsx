'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from './admin-client'

/**
 * Desk review (EDIT-001). Lists stories waiting for the desk, shows the
 * automated checks and site guidance, and lets a publisher attest every
 * self-check item before approving or requesting changes.
 */

interface QueueItem {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly status: string
  readonly revision: number
  readonly updatedAt: string
  readonly review?: { readonly status: string; readonly note?: string }
}

interface Check {
  readonly id: string
  readonly level: 'pass' | 'warn' | 'fail'
  readonly message: string
}

interface ChecklistItem {
  readonly id: string
  readonly label: string
  readonly description: string
}

interface Report {
  readonly checks: readonly Check[]
  readonly checklist: readonly ChecklistItem[]
  readonly guidance?: string
  readonly approvalValid: boolean
  readonly review?: {
    readonly status: string
    readonly note?: string
    readonly reviewedAt: string
    readonly reviewer: { readonly kind: string; readonly id: string }
  }
}

interface ReportResponse {
  readonly postId: string
  readonly revision: number
  readonly status: string
  readonly report: Report
}

const LEVEL_LABEL: Record<Check['level'], string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
}

export default function DeskReviewPanel() {
  const [queue, setQueue] = useState<readonly QueueItem[]>([])
  const [selected, setSelected] = useState<ReportResponse | undefined>()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const loadQueue = useCallback(async () => {
    const response = await adminFetch('/api/desk')
    if (!response.ok) {
      setMessage('The desk queue could not be loaded.')
      return
    }
    const body = (await response.json()) as { queue: readonly QueueItem[] }
    setQueue(body.queue)
  }, [])

  const loadReport = useCallback(async (postId: string) => {
    setMessage('Loading desk report…')
    const response = await adminFetch(
      `/api/desk?post=${encodeURIComponent(postId)}`,
    )
    if (!response.ok) {
      setMessage('The desk report could not be loaded.')
      return
    }
    const body = (await response.json()) as ReportResponse
    setSelected(body)
    setChecked({})
    setNote('')
    setMessage(
      body.report.approvalValid
        ? 'This revision is already approved.'
        : 'Review the checks and attest every item before approving.',
    )
  }, [])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const failing =
    selected?.report.checks.filter((c) => c.level === 'fail') ?? []
  const allAttested =
    selected !== undefined &&
    selected.report.checklist.every((item) => checked[item.id])

  async function decide(action: 'approve' | 'request-changes') {
    if (!selected) return
    setBusy(true)
    setMessage(action === 'approve' ? 'Approving…' : 'Recording feedback…')
    try {
      const response = await adminFetch('/api/desk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postId: selected.postId,
          revision: selected.revision,
          action,
          note: note || undefined,
          checklist: selected.report.checklist.map((item) => ({
            id: item.id,
            checked: Boolean(checked[item.id]),
          })),
        }),
      })
      const body = (await response.json()) as ReportResponse & {
        error?: string
      }
      if (!response.ok) {
        if (body.report) setSelected({ ...selected, report: body.report })
        setMessage(body.error ?? 'The desk decision was not accepted.')
        return
      }
      setSelected(body)
      setMessage(
        action === 'approve'
          ? 'Approved. The story can now be scheduled or published.'
          : 'Changes requested; the author will see your note.',
      )
      await loadQueue()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="desk-heading">
      <div className="settings-heading">
        <div>
          <p className="eyebrow">Editorial desk</p>
          <h2 id="desk-heading">Desk review</h2>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() => void loadQueue()}
        >
          Refresh queue
        </button>
      </div>
      <p>
        A story is published only with a desk approval for its current content.
        Automated checks must pass and every self-check item must be attested; a
        later edit sends the story back to the desk.
      </p>
      <div className="desk-layout">
        <div>
          <h3>Waiting for the desk</h3>
          {queue.length === 0 ? (
            <p className="muted">No stories are waiting.</p>
          ) : (
            <ul className="desk-queue">
              {queue.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      selected?.postId === item.id ? 'link current' : 'link'
                    }
                    aria-current={
                      selected?.postId === item.id ? 'true' : undefined
                    }
                    onClick={() => void loadReport(item.id)}
                  >
                    {item.title}
                  </button>
                  <small>
                    {item.status} · r{item.revision}
                    {item.review ? ` · desk: ${item.review.status}` : ''}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selected ? (
          <div className="desk-report" aria-live="polite">
            <h3>Automated checks</h3>
            <ul className="desk-checks">
              {selected.report.checks.map((check) => (
                <li key={check.id} data-level={check.level}>
                  <strong>{LEVEL_LABEL[check.level]}</strong>{' '}
                  <code>{check.id}</code> — {check.message}
                </li>
              ))}
            </ul>
            {failing.length > 0 ? (
              <p role="status">
                {failing.length} check{failing.length === 1 ? '' : 's'} must
                pass before this story can be approved.
              </p>
            ) : null}
            {selected.report.guidance ? (
              <>
                <h3>Site guidance</h3>
                <pre className="desk-guidance">{selected.report.guidance}</pre>
              </>
            ) : null}
            <h3>Self-check list</h3>
            <ul className="desk-checklist">
              {selected.report.checklist.map((item) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(checked[item.id])}
                      onChange={(event) =>
                        setChecked({
                          ...checked,
                          [item.id]: event.target.checked,
                        })
                      }
                    />{' '}
                    <span>
                      <strong>{item.label}</strong>
                      <br />
                      <small>{item.description}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <label htmlFor="desk-note">Desk note</label>
            <textarea
              id="desk-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was checked, or what must change."
            />
            <div className="desk-actions">
              <button
                type="button"
                disabled={busy || failing.length > 0 || !allAttested}
                onClick={() => void decide('approve')}
              >
                Approve for publication
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busy || !note.trim()}
                onClick={() => void decide('request-changes')}
              >
                Request changes
              </button>
            </div>
            {selected.report.review ? (
              <p className="muted">
                Last decision: {selected.report.review.status} by{' '}
                {selected.report.review.reviewer.kind}{' '}
                {selected.report.review.reviewer.id} on{' '}
                {selected.report.review.reviewedAt}
                {selected.report.review.note
                  ? ` — ${selected.report.review.note}`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="status" role="status">
        {message}
      </p>
    </section>
  )
}
