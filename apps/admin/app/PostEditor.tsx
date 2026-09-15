import {
  useState,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from 'react'
import { adminFetch } from './admin-client'
import type {
  AdminAuthor,
  AdminPost,
  AdminTag,
  EditorialStatus,
} from './admin-model'

type UpdatePost = <Key extends keyof AdminPost>(
  field: Key,
  value: AdminPost[Key],
) => void

interface PostEditorProps {
  selected: AdminPost
  setSelected: Dispatch<SetStateAction<AdminPost>>
  authors: AdminAuthor[]
  tags: AdminTag[]
  update: UpdatePost
  save: () => Promise<void>
  remove: () => Promise<void>
}

function BasicPostFields({
  selected,
  update,
}: Readonly<Pick<PostEditorProps, 'selected' | 'update'>>): ReactElement {
  const [xUrl, setXUrl] = useState('')
  const [embedMessage, setEmbedMessage] = useState('')
  const insertXPost = async () => {
    const response = await adminFetch('/api/embeds/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: xUrl }),
    })
    const data = (await response.json().catch(() => ({}))) as {
      embed?: { html?: string }
      error?: { message?: string } | string
    }
    if (response.ok && data.embed?.html) {
      update(
        'bodyHtml',
        `${selected.bodyHtml}${selected.bodyHtml ? '\n' : ''}${data.embed.html}`,
      )
      setXUrl('')
      setEmbedMessage('X source card inserted. Save content to keep it.')
      return
    }
    const error =
      typeof data.error === 'string' ? data.error : data.error?.message
    setEmbedMessage(error ?? `Could not resolve X post (${response.status}).`)
  }
  return (
    <>
      <label>
        Title
        <input
          value={selected.title}
          onChange={(event) => update('title', event.target.value)}
        />
      </label>
      <label>
        Slug
        <input
          value={selected.slug}
          onChange={(event) => update('slug', event.target.value)}
        />
      </label>
      <label>
        Excerpt
        <textarea
          value={selected.excerpt}
          onChange={(event) => update('excerpt', event.target.value)}
        />
      </label>
      <label>
        Body HTML
        <textarea
          className="body"
          value={selected.bodyHtml}
          onChange={(event) => update('bodyHtml', event.target.value)}
        />
      </label>
      <fieldset>
        <legend>Insert X source card</legend>
        <label>
          Canonical X post URL
          <input
            type="url"
            placeholder="https://x.com/handle/status/123"
            value={xUrl}
            onChange={(event) => setXUrl(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => void insertXPost()}
        >
          Resolve and insert
        </button>
        {embedMessage ? <p role="status">{embedMessage}</p> : null}
      </fieldset>
    </>
  )
}

function AuthorField({
  selected,
  setSelected,
  authors,
}: Readonly<
  Pick<PostEditorProps, 'selected' | 'setSelected' | 'authors'>
>): ReactElement {
  return (
    <label>
      Author
      <select
        value={selected.authorSlug}
        onChange={(event) => {
          const author = authors.find(
            (candidate) => candidate.slug === event.target.value,
          )
          if (author)
            setSelected((current) => ({
              ...current,
              author: author.name,
              authorSlug: author.slug,
            }))
        }}
      >
        {authors
          .filter(
            (author) => author.active || author.slug === selected.authorSlug,
          )
          .map((author) => (
            <option key={author.slug} value={author.slug}>
              {author.name}
              {author.active ? '' : ' (archived)'}
            </option>
          ))}
      </select>
    </label>
  )
}

function PublishingFields({
  selected,
  update,
}: Readonly<Pick<PostEditorProps, 'selected' | 'update'>>): ReactElement {
  return (
    <>
      <label>
        Editorial status
        <select
          value={selected.status}
          onChange={(event) =>
            update('status', event.target.value as EditorialStatus)
          }
        >
          <option value="draft">Draft</option>
          <option value="review">Review</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
        </select>
      </label>
      <label>
        Published at
        <input
          type="datetime-local"
          value={selected.publishedAt.slice(0, 16)}
          onChange={(event) =>
            update('publishedAt', new Date(event.target.value).toISOString())
          }
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={selected.featured}
          onChange={(event) => update('featured', event.target.checked)}
        />{' '}
        Featured
      </label>
      <label>
        Editor's picks rank
        <input
          type="number"
          min="1"
          step="1"
          value={selected.featuredRank ?? ''}
          onChange={(event) =>
            update(
              'featuredRank',
              event.target.value ? Number(event.target.value) : undefined,
            )
          }
        />
      </label>
    </>
  )
}

function TagPicker({
  selected,
  tags,
  update,
}: Readonly<
  Pick<PostEditorProps, 'selected' | 'tags' | 'update'>
>): ReactElement {
  return (
    <fieldset className="tag-picker">
      <legend>Tags</legend>
      {tags.map((tag) => (
        <label className="checkbox" key={tag.slug}>
          <input
            type="checkbox"
            disabled={!tag.active}
            checked={selected.categories.includes(tag.slug)}
            onChange={(event) =>
              update(
                'categories',
                event.target.checked
                  ? [...selected.categories, tag.slug]
                  : selected.categories.filter(
                      (category) => category !== tag.slug,
                    ),
              )
            }
          />
          {tag.name}
          {tag.active ? '' : ' (archived)'}
        </label>
      ))}
    </fieldset>
  )
}

function SeoFields({
  selected,
  update,
}: Readonly<Pick<PostEditorProps, 'selected' | 'update'>>): ReactElement {
  return (
    <fieldset className="seo-fields">
      <legend>Search metadata</legend>
      <label>
        SEO title
        <input
          maxLength={70}
          value={selected.seoTitle}
          onChange={(event) => update('seoTitle', event.target.value)}
        />
      </label>
      <label>
        SEO description
        <textarea
          maxLength={180}
          value={selected.seoDescription}
          onChange={(event) => update('seoDescription', event.target.value)}
        />
      </label>
    </fieldset>
  )
}

function EditorActions({
  selected,
  save,
  remove,
}: Readonly<
  Pick<PostEditorProps, 'selected' | 'save' | 'remove'>
>): ReactElement {
  return (
    <div className="editor-actions">
      <button className="save" onClick={() => void save()}>
        Save content
      </button>
      {selected.id ? (
        <button className="danger" onClick={() => void remove()}>
          Delete post
        </button>
      ) : null}
    </div>
  )
}

export default function PostEditor(
  props: Readonly<PostEditorProps>,
): ReactElement {
  return (
    <section className="editor">
      <h2>{props.selected.id ? 'Edit post' : 'New post'}</h2>
      <BasicPostFields selected={props.selected} update={props.update} />
      <AuthorField
        selected={props.selected}
        setSelected={props.setSelected}
        authors={props.authors}
      />
      <PublishingFields selected={props.selected} update={props.update} />
      <TagPicker
        selected={props.selected}
        tags={props.tags}
        update={props.update}
      />
      <SeoFields selected={props.selected} update={props.update} />
      <EditorActions
        selected={props.selected}
        save={props.save}
        remove={props.remove}
      />
    </section>
  )
}
