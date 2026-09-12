'use client'

import { useState } from 'react'

export default function LoginForm({
  bootstrap,
}: {
  readonly bootstrap: boolean
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const response = await fetch(
      bootstrap ? '/api/auth/bootstrap' : '/api/auth/login',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(bootstrap ? { 'x-admin-bootstrap-secret': secret } : {}),
        },
        body: JSON.stringify({ email, password }),
      },
    )
    if (response.ok) {
      window.location.assign('/')
      return
    }
    setMessage(
      'Unable to sign in. Check the supplied credentials and try again.',
    )
  }
  return (
    <main className="admin-locked">
      <p className="eyebrow">Publisher</p>
      <h1>{bootstrap ? 'Create the owner account' : 'Sign in'}</h1>
      <p>
        {bootstrap
          ? 'This one-time step is available only while no owner exists.'
          : 'Use your Publisher administrator account.'}
      </p>
      <form className="editor" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={bootstrap ? 'new-password' : 'current-password'}
            minLength={12}
            required
          />
        </label>
        {bootstrap && (
          <label>
            Bootstrap secret
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              autoComplete="one-time-code"
              required
            />
          </label>
        )}
        <button className="save" type="submit">
          {bootstrap ? 'Create owner account' : 'Sign in'}
        </button>
        {message && <p role="alert">{message}</p>}
      </form>
    </main>
  )
}
