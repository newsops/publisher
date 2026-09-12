'use client'

import AdminDashboardView from './AdminDashboardView'
import useAdminDashboard from './useAdminDashboard'

export default function AdminDashboard() {
  const model = useAdminDashboard()
  return <AdminDashboardView state={model.state} actions={model.actions} />
}
