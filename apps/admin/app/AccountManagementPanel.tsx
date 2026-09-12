'use client'

import { useEffect, useState } from 'react'

type Account = {
  id: string
  email: string
  role: 'owner' | 'editor' | 'publisher'
  active: boolean
}

export default function AccountManagementPanel() {
  const [owner, setOwner] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'editor' | 'publisher'>('editor')
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')

  async function load() {
    const session = await fetch('/api/auth/session', {
      credentials: 'same-origin',
    })
    if (!session.ok) return
    const current = (await session.json()) as { account: { roles: string[] } }
    if (!current.account.roles.includes('owner')) return
    setOwner(true)
    const response = await fetch('/api/accounts', {
      credentials: 'same-origin',
    })
    if (response.ok)
      setAccounts(((await response.json()) as { accounts: Account[] }).accounts)
  }

  useEffect(() => {
    void load()
  }, [])
  if (!owner) return null

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const response = await fetch('/api/accounts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, role }),
    })
    if (!response.ok) {
      setMessage('Could not create the account.')
      return
    }
    setEmail('')
    setPassword('')
    setMessage('Account created.')
    await load()
  }

  async function setActive(account: Account, active: boolean) {
    const response = await fetch(`/api/accounts/${account.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    setMessage(
      response.ok
        ? 'Account updated. Existing sessions were revoked.'
        : 'Could not update the account.',
    )
    if (response.ok) await load()
  }

  async function setRoleForAccount(
    account: Account,
    nextRole: 'editor' | 'publisher',
  ) {
    const response = await fetch(`/api/accounts/${account.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    setMessage(
      response.ok
        ? 'Role updated. Existing sessions were revoked.'
        : 'Could not update the account.',
    )
    if (response.ok) await load()
  }

  async function resetPassword(account: Account) {
    const password = passwords[account.id]
    if (!password || password.length < 12) {
      setMessage('A reset password must contain at least 12 characters.')
      return
    }
    const response = await fetch(`/api/accounts/${account.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setMessage(
      response.ok
        ? 'Password reset. Existing sessions were revoked.'
        : 'Could not reset the password.',
    )
    if (response.ok) {
      setPasswords((current) => ({ ...current, [account.id]: '' }))
      await load()
    }
  }

  return (
    <section className="settings-panel account-management">
      <h2>Administrator accounts</h2>
      <p>
        Owner accounts create, disable, and reset editor or publisher accounts.
        Password resets revoke existing sessions.
      </p>
      <form className="editor" onSubmit={create}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Initial password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            required
          />
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as 'editor' | 'publisher')
            }
          >
            <option value="editor">Editor</option>
            <option value="publisher">Publisher</option>
          </select>
        </label>
        <button className="save" type="submit">
          Create account
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <ul>
        {accounts.map((account) => (
          <li key={account.id}>
            <strong>{account.email}</strong> · {account.role} ·{' '}
            {account.active ? 'active' : 'disabled'}{' '}
            {account.role !== 'owner' && account.active && (
              <>
                <select
                  aria-label={`${account.email} role`}
                  value={account.role}
                  onChange={(event) =>
                    void setRoleForAccount(
                      account,
                      event.target.value as 'editor' | 'publisher',
                    )
                  }
                >
                  <option value="editor">Editor</option>
                  <option value="publisher">Publisher</option>
                </select>
                <button
                  className="secondary"
                  onClick={() => void setActive(account, false)}
                >
                  Disable
                </button>
              </>
            )}
            {account.active && (
              <>
                <input
                  aria-label={`${account.email} reset password`}
                  type="password"
                  value={passwords[account.id] ?? ''}
                  onChange={(event) =>
                    setPasswords((current) => ({
                      ...current,
                      [account.id]: event.target.value,
                    }))
                  }
                  minLength={12}
                  placeholder="Reset password"
                />
                <button
                  className="secondary"
                  onClick={() => void resetPassword(account)}
                >
                  Reset password
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
