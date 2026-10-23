import { useState, type Dispatch, type SetStateAction } from 'react'
import type { DashboardState } from './AdminDashboardView'
import {
  blankPost,
  emptyAgentGuidance,
  emptySettings,
  type AdminAgentGuidance,
  type AdminAdapter,
  type AdminArticle,
  type AdminAuthor,
  type AdminMedia,
  type AdminPost,
  type AdminSettings,
  type AdminTag,
} from './admin-model'

export interface DashboardSetters {
  setPosts: Dispatch<SetStateAction<AdminPost[]>>
  setTags: Dispatch<SetStateAction<AdminTag[]>>
  setCategories: Dispatch<SetStateAction<AdminTag[]>>
  setAuthors: Dispatch<SetStateAction<AdminAuthor[]>>
  setSettings: Dispatch<SetStateAction<AdminSettings>>
  setAdapters: Dispatch<SetStateAction<AdminAdapter[]>>
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

function useContentLists() {
  const [posts, setPosts] = useState<AdminPost[]>([])
  const [tags, setTags] = useState<AdminTag[]>([])
  const [categories, setCategories] = useState<AdminTag[]>([])
  const [authors, setAuthors] = useState<AdminAuthor[]>([])
  return {
    state: { posts, tags, categories, authors },
    setters: { setPosts, setTags, setCategories, setAuthors },
  }
}

function usePublicationState() {
  const [settings, setSettings] = useState<AdminSettings>(emptySettings)
  const [adapters, setAdapters] = useState<AdminAdapter[]>([])
  const [media, setMedia] = useState<AdminMedia[]>([])
  const [guidance, setGuidance] =
    useState<AdminAgentGuidance>(emptyAgentGuidance)
  return {
    state: { settings, adapters, media, guidance },
    setters: { setSettings, setAdapters, setMedia, setGuidance },
  }
}

function useEditorState() {
  const [selected, setSelected] = useState<AdminPost>(blankPost())
  const [newTagName, setNewTagName] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newAuthorName, setNewAuthorName] = useState('')
  const [message, setMessage] = useState('인증 보호가 활성화된 어드민입니다.')
  const [article, setArticle] = useState<AdminArticle | undefined>()
  const [activeLocale, setActiveLocale] = useState('')
  return {
    state: {
      selected,
      newTagName,
      newCategoryName,
      newAuthorName,
      message,
      article,
      activeLocale,
    },
    setters: {
      setSelected,
      setNewTagName,
      setNewCategoryName,
      setNewAuthorName,
      setMessage,
      setArticle,
      setActiveLocale,
    },
  }
}

export function useDashboardState(): {
  state: DashboardState
  setters: DashboardSetters
} {
  const content = useContentLists()
  const publication = usePublicationState()
  const editor = useEditorState()
  return {
    state: { ...content.state, ...publication.state, ...editor.state },
    setters: { ...content.setters, ...publication.setters, ...editor.setters },
  }
}
