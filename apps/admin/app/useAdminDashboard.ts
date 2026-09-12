import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { DashboardActions, DashboardState } from './AdminDashboardView'
import * as action from './admin-actions'
import * as articleAction from './article-actions'
import * as publishAction from './publish-actions'
import { variantActions } from './variant-actions'
import {
  blankPost,
  emptySettings,
  type AdminAuthor,
  type AdminArticle,
  type AdminPost,
  type AdminSettings,
  type AdminTag,
  type AdminPlugin,
} from './admin-model'

export interface DashboardSetters {
  setPosts: Dispatch<SetStateAction<AdminPost[]>>
  setTags: Dispatch<SetStateAction<AdminTag[]>>
  setAuthors: Dispatch<SetStateAction<AdminAuthor[]>>
  setSettings: Dispatch<SetStateAction<AdminSettings>>
  setPlugins: Dispatch<SetStateAction<AdminPlugin[]>>
  setSelected: Dispatch<SetStateAction<AdminPost>>
  setNewTagName: Dispatch<SetStateAction<string>>
  setNewAuthorName: Dispatch<SetStateAction<string>>
  setMessage: Dispatch<SetStateAction<string>>
  setArticle: Dispatch<SetStateAction<AdminArticle | undefined>>
  setActiveLocale: Dispatch<SetStateAction<string>>
}

function useDashboardState(): {
  state: DashboardState
  setters: DashboardSetters
} {
  const [posts, setPosts] = useState<AdminPost[]>([])
  const [tags, setTags] = useState<AdminTag[]>([])
  const [authors, setAuthors] = useState<AdminAuthor[]>([])
  const [settings, setSettings] = useState<AdminSettings>(emptySettings)
  const [plugins, setPlugins] = useState<AdminPlugin[]>([])
  const [selected, setSelected] = useState<AdminPost>(blankPost())
  const [newTagName, setNewTagName] = useState('')
  const [newAuthorName, setNewAuthorName] = useState('')
  const [message, setMessage] = useState('인증 보호가 활성화된 어드민입니다.')
  const [article, setArticle] = useState<AdminArticle | undefined>()
  const [activeLocale, setActiveLocale] = useState('')
  return {
    state: {
      posts,
      tags,
      authors,
      settings,
      plugins,
      selected,
      newTagName,
      newAuthorName,
      message,
      article,
      activeLocale,
    },
    setters: {
      setPosts,
      setTags,
      setAuthors,
      setSettings,
      setPlugins,
      setSelected,
      setNewTagName,
      setNewAuthorName,
      setMessage,
      setArticle,
      setActiveLocale,
    },
  }
}

function useInitialData(setters: DashboardSetters): void {
  useEffect(() => {
    void Promise.all([
      action.loadPosts(
        setters.setPosts,
        setters.setSelected,
        setters.setMessage,
      ),
      action.loadTags(setters.setTags),
      action.loadAuthors(setters.setAuthors, setters.setSelected),
      action.loadSettings(setters.setSettings),
      action.loadPlugins(setters.setPlugins),
    ]).catch(() => {
      setters.setMessage('초기 관리자 데이터를 불러오지 못했습니다.')
    })
  }, [])
}

function postActions(
  state: DashboardState,
  setters: DashboardSetters,
): Pick<
  DashboardActions,
  'setSelected' | 'update' | 'createPost' | 'savePost' | 'removePost'
> {
  const reloadPosts = () =>
    action.loadPosts(setters.setPosts, setters.setSelected, setters.setMessage)
  return {
    setSelected: setters.setSelected,
    update: (field, value) =>
      setters.setSelected((current) => ({ ...current, [field]: value })),
    createPost: () =>
      action.createPost(
        state.authors,
        state.tags,
        setters.setSelected,
        setters.setMessage,
      ),
    savePost: () =>
      action.savePost(state.selected, setters.setMessage, reloadPosts),
    removePost: () =>
      action.removePost(state.selected, setters.setMessage, reloadPosts),
  }
}

function authorActions(
  state: DashboardState,
  setters: DashboardSetters,
): Pick<
  DashboardActions,
  'setNewAuthorName' | 'createAuthor' | 'editAuthor' | 'archiveAuthor'
> {
  const reloadAuthors = () =>
    action.loadAuthors(setters.setAuthors, setters.setSelected)
  const reloadAuthorPosts = async () => {
    await Promise.all([
      reloadAuthors(),
      action.loadPosts(
        setters.setPosts,
        setters.setSelected,
        setters.setMessage,
      ),
    ])
  }
  return {
    setNewAuthorName: setters.setNewAuthorName,
    createAuthor: () =>
      action.createAuthor(
        state.newAuthorName,
        setters.setNewAuthorName,
        setters.setMessage,
        reloadAuthors,
      ),
    editAuthor: (author) =>
      action.editAuthor(author, setters.setMessage, reloadAuthorPosts),
    archiveAuthor: (author) =>
      action.archiveAuthor(author, setters.setMessage, reloadAuthors),
  }
}

function tagActions(
  state: DashboardState,
  setters: DashboardSetters,
): Pick<
  DashboardActions,
  'setNewTagName' | 'createTag' | 'renameTag' | 'archiveTag'
> {
  const reloadTags = () => action.loadTags(setters.setTags)
  return {
    setNewTagName: setters.setNewTagName,
    createTag: () =>
      action.createTag(
        state.newTagName,
        setters.setNewTagName,
        setters.setMessage,
        reloadTags,
      ),
    renameTag: (tag) => action.renameTag(tag, setters.setMessage, reloadTags),
    archiveTag: (tag) => action.archiveTag(tag, setters.setMessage, reloadTags),
  }
}

function dashboardActions(
  state: DashboardState,
  setters: DashboardSetters,
): Omit<
  DashboardActions,
  | 'setActiveLocale'
  | 'updateVariant'
  | 'addVariant'
  | 'saveVariant'
  | 'removeVariant'
> {
  return {
    ...postActions(state, setters),
    ...authorActions(state, setters),
    ...tagActions(state, setters),
    setSettings: setters.setSettings,
    configurePlugin: (pluginId, configuration, revision) =>
      action.configurePlugin(
        pluginId,
        configuration,
        revision,
        setters.setMessage,
        () => action.loadPlugins(setters.setPlugins),
      ),
    validatePlugin: (pluginId, configuration) =>
      action.validatePluginConfiguration(pluginId, configuration),
    setPluginState: (pluginId, state, revision) =>
      action.setPluginState(pluginId, state, revision, setters.setMessage, () =>
        action.loadPlugins(setters.setPlugins),
      ),
    saveSettings: () =>
      action.saveSettings(state.settings, setters.setMessage, () =>
        action.loadSettings(setters.setSettings),
      ),
    publish: () => publishAction.publishSnapshot(setters.setMessage),
  }
}

export default function useAdminDashboard(): {
  state: DashboardState
  actions: DashboardActions
} {
  const model = useDashboardState()
  useInitialData(model.setters)
  useEffect(() => {
    void articleAction.loadArticle(
      model.state.selected,
      model.setters.setArticle,
      model.setters.setActiveLocale,
    )
  }, [model.state.selected.id, model.state.selected.sourceId])
  return {
    state: model.state,
    actions: {
      ...dashboardActions(model.state, model.setters),
      ...variantActions(model.state, model.setters),
    },
  }
}
