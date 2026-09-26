'use client'

import { useState, type FormEvent } from 'react'
import { adminFetch } from './admin-client'

export default function PublicationManagementPanel() {
  const [siteId, setSiteId] = useState('')
  const [name, setName] = useState('')
  const [canonicalOrigin, setCanonicalOrigin] = useState('')
  const [message, setMessage] = useState('')

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('Creating publication…')
    const response = await adminFetch('/api/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, name, canonicalOrigin }),
    })
    if (!response.ok) {
      setMessage('Publication could not be created.')
      return
    }
    setMessage(
      'Publication created. Select it from the site menu to manage it.',
    )
    setSiteId('')
    setName('')
    setCanonicalOrigin('')
  }

  return (
    <section className="settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Publications</p>
          <h2>Create publication</h2>
        </div>
      </div>
      <p>
        A publication has its own content, media, release history, and public
        domain. Creating it does not change DNS or publish content.
      </p>
      <form className="settings-grid" onSubmit={(event) => void create(event)}>
        <label>
          Site ID
          <input
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            placeholder="ai-trend-times"
          />
        </label>
        <label>
          Publication name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example News"
          />
        </label>
        <label>
          Canonical origin
          <input
            required
            type="url"
            value={canonicalOrigin}
            onChange={(event) => setCanonicalOrigin(event.target.value)}
            placeholder="https://news.example.com"
          />
        </label>
        <button className="secondary" type="submit">
          Create publication
        </button>
      </form>
      <p className="status" role="status">
        {message}
      </p>
    </section>
  )
}
