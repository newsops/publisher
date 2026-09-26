import type { Dispatch, ReactElement, SetStateAction } from 'react'
import type {
  AdminArticle,
  AdminArticleVariant,
  VariantStatus,
} from './admin-model'

function blankVariant(): AdminArticleVariant {
  return {
    locale: '',
    slug: '',
    title: '',
    excerpt: '',
    bodyMarkdown: '',
    bodyHtml: '',
    seoTitle: '',
    seoDescription: '',
    status: 'draft',
    revision: 0,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export default function ArticleVariantEditor({
  article,
  activeLocale,
  setActiveLocale,
  update,
  add,
  remove,
  save,
}: Readonly<{
  article?: AdminArticle
  activeLocale: string
  setActiveLocale: Dispatch<SetStateAction<string>>
  update: (field: keyof AdminArticleVariant, value: string | number) => void
  add: () => void
  remove: () => Promise<void>
  save: () => Promise<void>
}>): ReactElement {
  const variant = article?.variants.find((item) => item.locale === activeLocale)
  const selected = variant ?? blankVariant()
  const duplicate = Boolean(
    selected.locale &&
    article?.variants.some(
      (item) => item.locale === selected.locale && item.locale !== activeLocale,
    ),
  )
  return (
    <section className="variant-editor" aria-label="Article translations">
      <div className="section-heading">
        <div>
          <h2>Language variants</h2>
          <small>
            {article ? `aggregate r${article.revision}` : 'loading'}
          </small>
        </div>
        <button className="secondary" onClick={add} disabled={!article}>
          Add language
        </button>
      </div>
      {article ? (
        <>
          <label>
            Active language
            <select
              value={activeLocale}
              onChange={(event) => setActiveLocale(event.target.value)}
            >
              {article.variants.map((item) => (
                <option key={item.locale} value={item.locale}>
                  {item.locale}
                </option>
              ))}
            </select>
          </label>
          <label>
            Locale
            <input
              value={selected.locale}
              onChange={(event) => update('locale', event.target.value)}
            />
          </label>
          {duplicate ? (
            <p className="form-error" role="alert">
              Each locale must be unique.
            </p>
          ) : null}
          {(
            [
              'title',
              'slug',
              'excerpt',
              'bodyMarkdown',
              'seoTitle',
              'seoDescription',
            ] as const
          ).map((field) => (
            <label key={field}>
              {field}
              {field === 'bodyMarkdown' ||
              field === 'excerpt' ||
              field === 'seoDescription' ? (
                <textarea
                  aria-label={
                    field === 'bodyMarkdown' ? 'Body Markdown' : field
                  }
                  className={field === 'bodyMarkdown' ? 'body' : undefined}
                  value={selected[field]}
                  onChange={(event) => update(field, event.target.value)}
                />
              ) : (
                <input
                  value={selected[field]}
                  onChange={(event) => update(field, event.target.value)}
                />
              )}
              {field === 'bodyMarkdown' ? (
                <small>CommonMark source. Raw HTML is not accepted.</small>
              ) : null}
            </label>
          ))}
          <label>
            Status
            <select
              value={selected.status}
              onChange={(event) =>
                update('status', event.target.value as VariantStatus)
              }
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
            </select>
          </label>
          <div className="editor-actions">
            <button className="save" onClick={() => void save()}>
              Save variant
            </button>
            <button
              className="danger"
              disabled={article.variants.length <= 1}
              onClick={() => void remove()}
            >
              Remove variant
            </button>
          </div>
        </>
      ) : (
        <p role="status">Select a saved article to manage translations.</p>
      )}
    </section>
  )
}
