'use client'

import { useEffect, useState } from 'react'
import type {
  ModerationComment,
  ModerationStatus,
} from './lib/comment-moderation'

type PanelState = 'loading' | 'ready' | 'unavailable'

export default function CommentModerationPanel() {
  const [comments, setComments] = useState<ModerationComment[]>([])
  const [state, setState] = useState<PanelState>('loading')
  const [message, setMessage] = useState('')

  async function load(): Promise<void> {
    setState('loading')
    try {
      const response = await fetch('/api/comments/moderation?status=pending', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error('moderation unavailable')
      const payload = (await response.json()) as {
        comments?: ModerationComment[]
      }
      setComments(Array.isArray(payload.comments) ? payload.comments : [])
      setState('ready')
      setMessage('')
    } catch {
      setState('unavailable')
      setMessage('Comment moderation is temporarily unavailable.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function changeStatus(
    comment: ModerationComment,
    status: Exclude<ModerationStatus, 'pending'>,
  ): Promise<void> {
    const response = await fetch(
      `/api/comments/moderation/${encodeURIComponent(comment.id)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      },
    )
    if (!response.ok) {
      setMessage('Comment moderation update failed.')
      return
    }
    setComments((current) => current.filter((item) => item.id !== comment.id))
    setMessage(
      status === 'approved' ? 'Comment approved.' : 'Comment rejected.',
    )
  }

  return (
    <section className="moderation-panel" aria-labelledby="moderation-title">
      <div className="section-heading">
        <div>
          <h2 id="moderation-title">Comment moderation</h2>
          <small>Pending comments are not public until approved.</small>
        </div>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {state === 'loading' ? (
        <p role="status">Loading pending comments…</p>
      ) : null}
      {state === 'unavailable' ? <p role="status">{message}</p> : null}
      {state === 'ready' && comments.length === 0 ? (
        <p role="status">No pending comments.</p>
      ) : null}
      {comments.length > 0 ? (
        <ul className="moderation-list">
          {comments.map((comment) => (
            <li key={comment.id}>
              <div>
                <strong>{comment.authorName}</strong>
                <small>
                  {comment.slug} · {comment.createdAt}
                </small>
                <p>{comment.body}</p>
              </div>
              <div className="tag-actions">
                <button
                  className="save"
                  onClick={() => void changeStatus(comment, 'approved')}
                >
                  Approve
                </button>
                <button
                  className="danger"
                  onClick={() => void changeStatus(comment, 'rejected')}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {message && state !== 'unavailable' ? (
        <p className="meta" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
