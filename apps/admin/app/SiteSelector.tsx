'use client'

import { useEffect, useState } from 'react'
import { adminFetch, getAdminSiteId, setAdminSiteId } from './admin-client'

interface SiteOption {
  readonly siteId: string
  readonly name: string
}

export default function SiteSelector() {
  const [sites, setSites] = useState<SiteOption[]>([])
  const [selected, setSelected] = useState('default')

  useEffect(() => {
    setSelected(getAdminSiteId())
    void adminFetch('/api/sites')
      .then((response) => (response.ok ? response.json() : { sites: [] }))
      .then((payload: { sites?: SiteOption[] }) =>
        setSites(payload.sites ?? []),
      )
      .catch(() => setSites([]))
  }, [])

  if (sites.length <= 1) return null
  return (
    <label className="site-selector">
      Site
      <select
        value={selected}
        onChange={(event) => {
          setAdminSiteId(event.target.value)
          window.location.reload()
        }}
      >
        {sites.map((site) => (
          <option key={site.siteId} value={site.siteId}>
            {site.name}
          </option>
        ))}
      </select>
    </label>
  )
}
