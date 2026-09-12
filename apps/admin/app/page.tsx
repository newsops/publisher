import { headers } from 'next/headers'
import AdminDashboard from './AdminDashboard'
import { requireIdentity } from './lib/auth'

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  const incoming = await headers()
  const request = new Request('https://admin.publisher.com/', {
    headers: new Headers(incoming),
  })
  try {
    await requireIdentity(request)
    return <AdminDashboard />
  } catch {
    return (
      <main className="admin-locked">
        <h1>Publisher Admin</h1>
        <p>Verified administrator authentication is required.</p>
      </main>
    )
  }
}
