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
  type AdminMedia,
  type AdminAgentGuidance,
  emptyAgentGuidance,
} from './admin-model'

export interface DashboardSetters {
  setPosts: Dispatch<SetStateAction<AdminPost[]>>
  setTags: Dispatch<SetStateAction<AdminTag[]>>
  setCategories: Dispatch<SetStateAction<AdminTag[]>>
  setAuthors: Dispatch<SetStateAction<AdminAuthor[]>>
  setSettings: Dispatch<SetStateAction<AdminSettings>>
  setPlugins: Dispatch<SetStateAction<AdminPlugin[]>>
  setMedia: Dispatch<SetStateAction<AdminMedia[]>>
  setSelected: Dispatch<SetStateAction<AdminPost>>
  setNewTagName: Dispatch<SetStateAction<string>>
  setNewCategoryName: Dispatch<SetStateAction<string>>
  setNewAuthorName: Dispatch<SetStateAction<string>>
  setMessage: Dispatch<SetStateAction<string>>
  setArticle: Dispatch<SetStateAction<AdminArticle | undefined>>
  setActiveLocale: Dispatch<SetStateAction<string>>
  setGuidance: Dispatch<SetStateAction<AdminAgentGuidance>>
}

function useDashboardState(): {
  state: DashboardState
  setters: DashboardSetters
} {
  const [posts, setPosts] = useState<AdminPost[]>([])
  const [tags, setTags] = useState<AdminTag[]>([])
  const [categories, setCategories] = useState<AdminTag[]>([])
  const [authors, setAuthors] = useState<AdminAuthor[]>([])
  const [settings, setSettings] = useState<AdminSettings>(emptySettings)
  const [plugins, setPlugins] = useState<AdminPlugin[]>([])
  const [media, setMedia] = useState<AdminMedia[]>([])
  const [selected, setSelected] = useState<AdminPost>(blankPost())
  const [newTagName, setNewTagName] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newAuthorName, setNewAuthorName] = useState('')
  const [message, setMessage] = useState('인증 보호가 활성화된 어드민입니다.')
  const [article, setArticle] = useState<AdminArticle | undefined>()
  const [activeLocale, setActiveLocale] = useState('')
  const [guidance, setGuidance] =
    useState<AdminAgentGuidance>(emptyAgentGuidance)
  return {
    state: {
      posts,
      tags,
      categories,
      authors,
      settings,
      plugins,
      media,
      selected,
      newTagName,
      newCategoryName,
      newAuthorName,
      message,
      article,
      activeLocale,
      guidance,
    },
    setters: {
      setPosts,
      setTags,
      setCategories,
      setAuthors,
      setSettings,
      setPlugins,
      setMedia,
      setSelected,
      setNewTagName,
      setNewCategoryName,
      setNewAuthorName,
      setMessage,
      setArticle,
      setActiveLocale,
      setGuidance,
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
      action.loadCategories(setters.setCategories),
      action.loadAuthors(setters.setAuthors, setters.setSelected),
      action.loadSettings(setters.setSettings),
      action.loadPlugins(setters.setPlugins),
      action.loadMedia(setters.setMedia),
      action.loadAgentGuidance(setters.setGuidance),
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
        state.categories,
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

function categoryActions(
  state: DashboardState,
  setters: DashboardSetters,
): Pick<
  DashboardActions,
  'setNewCategoryName' | 'createCategory' | 'renameCategory' | 'archiveCategory'
> {
  const reload = () => action.loadCategories(setters.setCategories)
  return {
    setNewCategoryName: setters.setNewCategoryName,
    createCategory: () =>
      action.createCategory(
        state.newCategoryName,
        setters.setNewCategoryName,
        setters.setMessage,
        reload,
      ),
    renameCategory: (category) =>
      action.renameCategory(category, setters.setMessage, reload),
    archiveCategory: (category) =>
      action.archiveCategory(category, setters.setMessage, reload),
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
    ...categoryActions(state, setters),
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
    setGuidance: setters.setGuidance,
    saveAgentGuidance: () =>
      action.saveAgentGuidance(state.guidance, setters.setMessage, () =>
        action.loadAgentGuidance(setters.setGuidance),
      ),
    publish: () => publishAction.publishSnapshot(setters.setMessage),
    uploadMedia: (file) =>
      action.uploadMedia(file, setters.setMessage, () =>
        action.loadMedia(setters.setMedia),
      ),
    approveMedia: (media) =>
      action.approveMedia(media, setters.setMessage, () =>
        action.loadMedia(setters.setMedia),
      ),
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
