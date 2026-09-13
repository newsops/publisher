import { useState, type ChangeEvent, type ReactElement } from 'react'
import type { AdminMedia } from './admin-model'

export default function MediaLibraryPanel({
  media,
  selectedPath,
  upload,
  approve,
  select,
}: Readonly<{
  media: readonly AdminMedia[]
  selectedPath: string | undefined
  upload: (file: File) => Promise<void>
  approve: (media: AdminMedia) => Promise<void>
  select: (path: string | undefined) => void
}>): ReactElement {
  const [uploading, setUploading] = useState(false)
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await upload(file)
    } finally {
      setUploading(false)
    }
  }
  const approved = media.filter((item) => item.state === 'approved')
  return (
    <section className="media-panel" aria-label="Media library">
      <div className="section-heading">
        <div>
          <h2>Media library</h2>
          <small>
            {media.length} uploaded item{media.length === 1 ? '' : 's'}
          </small>
        </div>
        <label className="secondary media-upload">
          Upload image
          <input
            aria-label="Upload image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={uploading}
            onChange={(event) => void chooseFile(event)}
          />
        </label>
      </div>
      {uploading ? <p role="status">Uploading image…</p> : null}
      {selectedPath ? (
        <p className="media-selection">
          Selected image: <code>{selectedPath}</code>{' '}
          <button className="danger-text" onClick={() => select(undefined)}>
            Clear
          </button>
        </p>
      ) : null}
      {media.length === 0 ? <p role="status">No images uploaded yet.</p> : null}
      <ul className="media-list">
        {media.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.mimeType}</strong>
              <small>
                {item.width}×{item.height} · {item.state}
              </small>
            </div>
            {item.state === 'pending' ? (
              <button className="secondary" onClick={() => void approve(item)}>
                Approve variants
              </button>
            ) : null}
            {item.state === 'approved'
              ? item.variants.map((variant) => {
                  const previewPath = `/api/media/${encodeURIComponent(item.id)}/preview?variant=${encodeURIComponent(variant.sha256)}`
                  return (
                    <div className="media-variant" key={variant.publicPath}>
                      <img
                        alt={`Approved ${variant.mimeType} media preview`}
                        height={variant.height}
                        loading="lazy"
                        src={previewPath}
                        width={variant.width}
                      />
                      <button
                        className={
                          selectedPath === variant.publicPath
                            ? 'secondary selected-media'
                            : 'secondary'
                        }
                        onClick={() => select(variant.publicPath)}
                      >
                        Use {variant.mimeType.split('/')[1].toUpperCase()} (
                        {variant.width}×{variant.height})
                      </button>
                    </div>
                  )
                })
              : null}
          </li>
        ))}
      </ul>
      {media.length > 0 && approved.length === 0 ? (
        <p role="status">Uploaded images await approval.</p>
      ) : null}
    </section>
  )
}
