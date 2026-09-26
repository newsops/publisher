import { headers } from 'next/headers'
import AdminDashboard from './AdminDashboard'
import LoginForm from './LoginForm'
import { bootstrapAvailable, requireIdentity } from './lib/http/auth'

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
      <LoginForm bootstrap={await bootstrapAvailable().catch(() => false)} />
    )
  }
}
