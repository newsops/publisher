import type { Dispatch, ReactElement, SetStateAction } from 'react'
import type {
  AdminAuthor,
  AdminArticle,
  AdminArticleVariant,
  AdminPost,
  AdminSettings,
  AdminTag,
  AdminPlugin,
} from './admin-model'
import ManagementPanel from './ManagementPanel'
import PostEditor from './PostEditor'
import PublicationSettingsPanel from './PublicationSettingsPanel'
import ArticleVariantEditor from './ArticleVariantEditor'
import CommentModerationPanel from './CommentModerationPanel'
import SiteSelector from './SiteSelector'
import PluginManagementPanel from './PluginManagementPanel'

export interface DashboardState {
  posts: AdminPost[]
  tags: AdminTag[]
  authors: AdminAuthor[]
  settings: AdminSettings
  plugins: AdminPlugin[]
  selected: AdminPost
  newTagName: string
  newAuthorName: string
  message: string
  article?: AdminArticle
  activeLocale: string
}

export interface DashboardActions {
  setSettings: Dispatch<SetStateAction<AdminSettings>>
  setSelected: Dispatch<SetStateAction<AdminPost>>
  setNewTagName: Dispatch<SetStateAction<string>>
  setNewAuthorName: Dispatch<SetStateAction<string>>
  update: <Key extends keyof AdminPost>(
    field: Key,
    value: AdminPost[Key],
  ) => void
  createPost: () => void
  savePost: () => Promise<void>
  removePost: () => Promise<void>
  saveSettings: () => Promise<void>
  configurePlugin: (
    pluginId: string,
    configuration: Record<string, unknown>,
    revision?: number,
  ) => Promise<void>
  validatePlugin: (
    pluginId: string,
    configuration: Record<string, unknown>,
  ) => Promise<string | undefined>
  setPluginState: (
    pluginId: string,
    state: 'enabled' | 'disabled',
    revision: number,
  ) => Promise<void>
  createAuthor: () => Promise<void>
  editAuthor: (author: AdminAuthor) => Promise<void>
  archiveAuthor: (author: AdminAuthor) => Promise<void>
  createTag: () => Promise<void>
  renameTag: (tag: AdminTag) => Promise<void>
  archiveTag: (tag: AdminTag) => Promise<void>
  publish: () => Promise<void>
  setActiveLocale: Dispatch<SetStateAction<string>>
  updateVariant: (
    field: keyof AdminArticleVariant,
    value: string | number,
  ) => void
  addVariant: () => void
  saveVariant: () => Promise<void>
  removeVariant: () => Promise<void>
}

function AdminHeader({
  name,
  actions,
}: Readonly<{ name: string; actions: DashboardActions }>): ReactElement {
  return (
    <header className="admin-header">
      <div>
        <p className="eyebrow">{name}</p>
        <h1>Content Admin</h1>
      </div>
      <div className="header-actions">
        <SiteSelector />
        <button className="secondary" onClick={actions.createPost}>
          New post
        </button>
        <button className="publish" onClick={() => void actions.publish()}>
          Publish snapshot
        </button>
      </div>
    </header>
  )
}

function PostQueue({
  posts,
  selected,
  select,
}: Readonly<{
  posts: AdminPost[]
  selected: AdminPost
  select: Dispatch<SetStateAction<AdminPost>>
}>): ReactElement {
  return (
    <aside className="post-queue">
      <h2>Posts</h2>
      {posts.map((post) => (
        <button
          className={post.id === selected.id ? 'post-row active' : 'post-row'}
          key={post.id}
          onClick={() => select(post)}
        >
          <strong>{post.title}</strong>
          <small>
            {post.status} · r{post.revision}
          </small>
        </button>
      ))}
    </aside>
  )
}

function DashboardGrid({
  state,
  actions,
}: Readonly<{
  state: DashboardState
  actions: DashboardActions
}>): ReactElement {
  return (
    <div className="admin-grid">
      <PostQueue
        posts={state.posts}
        selected={state.selected}
        select={actions.setSelected}
      />
      <PostEditor
        selected={state.selected}
        setSelected={actions.setSelected}
        authors={state.authors}
        tags={state.tags}
        update={actions.update}
        save={actions.savePost}
        remove={actions.removePost}
      />
      <ArticleVariantEditor
        article={state.article}
        activeLocale={state.activeLocale}
        setActiveLocale={actions.setActiveLocale}
        update={actions.updateVariant}
        add={actions.addVariant}
        save={actions.saveVariant}
        remove={actions.removeVariant}
      />
      <ManagementPanel
        authors={state.authors}
        tags={state.tags}
        newAuthorName={state.newAuthorName}
        setNewAuthorName={actions.setNewAuthorName}
        newTagName={state.newTagName}
        setNewTagName={actions.setNewTagName}
        createAuthor={actions.createAuthor}
        editAuthor={actions.editAuthor}
        archiveAuthor={actions.archiveAuthor}
        createTag={actions.createTag}
        renameTag={actions.renameTag}
        archiveTag={actions.archiveTag}
      />
    </div>
  )
}

export default function AdminDashboardView({
  state,
  actions,
}: Readonly<{
  state: DashboardState
  actions: DashboardActions
}>): ReactElement {
  return (
    <main className="admin-shell">
      <AdminHeader name={state.settings.name} actions={actions} />
      <p className="status" role="status">
        {state.message}
      </p>
      <PublicationSettingsPanel
        settings={state.settings}
        setSettings={actions.setSettings}
        save={actions.saveSettings}
      />
      <PluginManagementPanel
        plugins={state.plugins}
        configure={actions.configurePlugin}
        validate={actions.validatePlugin}
        setState={actions.setPluginState}
      />
      <DashboardGrid state={state} actions={actions} />
      <CommentModerationPanel />
    </main>
  )
}
