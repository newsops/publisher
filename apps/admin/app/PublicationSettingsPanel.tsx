import type { Dispatch, SetStateAction } from 'react'
import type { AdminSettings } from './admin-model'

export default function PublicationSettingsPanel({
  settings,
  setSettings,
  save,
}: Readonly<{
  settings: AdminSettings
  setSettings: Dispatch<SetStateAction<AdminSettings>>
  save: () => Promise<void>
}>) {
  const fields = [
    'name',
    'shortName',
    'publisherName',
    'canonicalOrigin',
    'language',
    'locale',
  ] as const
  return (
    <section className="settings-panel">
      <div className="section-heading">
        <div>
          <h2>Publication settings</h2>
          <small>r{settings.revision}</small>
        </div>
        <button className="save" onClick={() => void save()}>
          Save settings
        </button>
      </div>
      <div className="settings-grid">
        {fields.map((field) => (
          <label key={field}>
            {field}
            <input
              value={settings[field]}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <label className="wide-field">
          Description
          <textarea
            value={settings.description}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Theme
          <select
            value={settings.themeId}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                themeId: event.target.value,
              }))
            }
          >
            <option value="editorial">
              Editorial — applies on next publish
            </option>
            <option value="signal">Signal — applies on next publish</option>
          </select>
          <small className="theme-preview-warning">
            Theme changes are build-time settings and take effect on the next
            published snapshot.
          </small>
        </label>
      </div>
    </section>
  )
}
