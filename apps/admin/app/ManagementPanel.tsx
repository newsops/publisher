import type { Dispatch, ReactElement, SetStateAction } from 'react'
import type { AdminAuthor, AdminTag } from './admin-model'

interface ManagementPanelProps {
  authors: AdminAuthor[]
  tags: AdminTag[]
  categories: AdminTag[]
  newAuthorName: string
  setNewAuthorName: Dispatch<SetStateAction<string>>
  newTagName: string
  newCategoryName: string
  setNewTagName: Dispatch<SetStateAction<string>>
  setNewCategoryName: Dispatch<SetStateAction<string>>
  createAuthor: () => Promise<void>
  editAuthor: (author: AdminAuthor) => Promise<void>
  archiveAuthor: (author: AdminAuthor) => Promise<void>
  createTag: () => Promise<void>
  renameTag: (tag: AdminTag) => Promise<void>
  archiveTag: (tag: AdminTag) => Promise<void>
  createCategory: () => Promise<void>
  renameCategory: (category: AdminTag) => Promise<void>
  archiveCategory: (category: AdminTag) => Promise<void>
}

function AuthorRow({
  author,
  edit,
  archive,
}: Readonly<{
  author: AdminAuthor
  edit: (author: AdminAuthor) => Promise<void>
  archive: (author: AdminAuthor) => Promise<void>
}>): ReactElement {
  return (
    <li>
      <span>
        {author.name}
        {author.active ? '' : ' (archived)'}
      </span>
      <span className="tag-actions">
        <button onClick={() => void edit(author)}>Edit</button>
        {author.active ? (
          <button className="danger-text" onClick={() => void archive(author)}>
            Archive
          </button>
        ) : null}
      </span>
    </li>
  )
}

function TagRow({
  tag,
  rename,
  archive,
}: Readonly<{
  tag: AdminTag
  rename: (tag: AdminTag) => Promise<void>
  archive: (tag: AdminTag) => Promise<void>
}>): ReactElement {
  return (
    <li>
      <span>
        {tag.name}
        {tag.active ? '' : ' (archived)'}
      </span>
      <span className="tag-actions">
        <button onClick={() => void rename(tag)}>Rename</button>
        {tag.active ? (
          <button className="danger-text" onClick={() => void archive(tag)}>
            Archive
          </button>
        ) : null}
      </span>
    </li>
  )
}

function AuthorsPanel(
  props: Readonly<
    Pick<
      ManagementPanelProps,
      | 'authors'
      | 'newAuthorName'
      | 'setNewAuthorName'
      | 'createAuthor'
      | 'editAuthor'
      | 'archiveAuthor'
    >
  >,
): ReactElement {
  return (
    <section>
      <h2>Authors</h2>
      <div className="tag-create">
        <input
          aria-label="New author name"
          placeholder="New author"
          value={props.newAuthorName}
          onChange={(event) => props.setNewAuthorName(event.target.value)}
        />
        <button className="secondary" onClick={() => void props.createAuthor()}>
          Add
        </button>
      </div>
      <ul className="tag-list">
        {props.authors.map((author) => (
          <AuthorRow
            key={author.slug}
            author={author}
            edit={props.editAuthor}
            archive={props.archiveAuthor}
          />
        ))}
      </ul>
    </section>
  )
}

function TagsPanel(
  props: Readonly<
    Pick<
      ManagementPanelProps,
      | 'tags'
      | 'newTagName'
      | 'setNewTagName'
      | 'createTag'
      | 'renameTag'
      | 'archiveTag'
    >
  >,
): ReactElement {
  return (
    <section>
      <h2>Tags</h2>
      <div className="tag-create">
        <input
          aria-label="New tag name"
          placeholder="New tag"
          value={props.newTagName}
          onChange={(event) => props.setNewTagName(event.target.value)}
        />
        <button className="secondary" onClick={() => void props.createTag()}>
          Add
        </button>
      </div>
      <ul className="tag-list">
        {props.tags.map((tag) => (
          <TagRow
            key={tag.slug}
            tag={tag}
            rename={props.renameTag}
            archive={props.archiveTag}
          />
        ))}
      </ul>
    </section>
  )
}

function CategoriesPanel(
  props: Readonly<
    Pick<
      ManagementPanelProps,
      | 'categories'
      | 'newCategoryName'
      | 'setNewCategoryName'
      | 'createCategory'
      | 'renameCategory'
      | 'archiveCategory'
    >
  >,
): ReactElement {
  return (
    <section>
      <h2>Categories</h2>
      <div className="tag-create">
        <input
          aria-label="New category name"
          placeholder="New category"
          value={props.newCategoryName}
          onChange={(event) => props.setNewCategoryName(event.target.value)}
        />
        <button
          className="secondary"
          onClick={() => void props.createCategory()}
        >
          Add
        </button>
      </div>
      <ul className="tag-list">
        {props.categories.map((category) => (
          <TagRow
            key={category.slug}
            tag={category}
            rename={props.renameCategory}
            archive={props.archiveCategory}
          />
        ))}
      </ul>
    </section>
  )
}

export default function ManagementPanel(
  props: Readonly<ManagementPanelProps>,
): ReactElement {
  return (
    <aside className="management-panel">
      <AuthorsPanel {...props} />
      <CategoriesPanel {...props} />
      <TagsPanel {...props} />
    </aside>
  )
}
