'use client'

import AdminDashboardView from './AdminDashboardView'
import useAdminDashboard from './useAdminDashboard'

export default function AdminDashboard() {
  const model = useAdminDashboard()
  async function signOut() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })
    window.location.assign('/')
  }
  return (
    <>
      <button
        className="admin-signout secondary"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
      <AdminDashboardView state={model.state} actions={model.actions} />
    </>
  )
}
