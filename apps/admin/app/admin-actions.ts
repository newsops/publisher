import type { Dispatch, SetStateAction } from 'react'
import { adminFetch } from './admin-client'
import {
  blankPost,
  type AdminAuthor,
  type AdminPost,
  type AdminSettings,
  type AdminTag,
  type AdminPlugin,
  type AdminMedia,
  type AdminAgentGuidance,
} from './admin-model'

type Setter<Value> = Dispatch<SetStateAction<Value>>

export async function loadPosts(
  setPosts: Setter<AdminPost[]>,
  setSelected: Setter<AdminPost>,
  setMessage: Setter<string>,
): Promise<void> {
  const response = await adminFetch('/api/posts')
  if (!response.ok) {
    setMessage(`콘텐츠를 불러올 수 없습니다 (${response.status}).`)
    return
  }
  const data = (await response.json()) as { posts: AdminPost[] }
  setPosts(data.posts)
  setSelected(
    (current) =>
      data.posts.find((post) => post.id === current.id) ??
      data.posts[0] ??
      current,
  )
}

export async function loadTags(setTags: Setter<AdminTag[]>): Promise<void> {
  const response = await adminFetch('/api/tags')
  if (!response.ok) return
  const data = (await response.json()) as { tags: AdminTag[] }
  setTags(data.tags)
}

export async function loadCategories(
  setCategories: Setter<AdminTag[]>,
): Promise<void> {
  const response = await adminFetch('/api/categories')
  if (!response.ok) return
  const data = (await response.json()) as { categories: AdminTag[] }
  setCategories(data.categories)
}

export async function loadAuthors(
  setAuthors: Setter<AdminAuthor[]>,
  setSelected: Setter<AdminPost>,
): Promise<void> {
  const response = await adminFetch('/api/authors')
  if (!response.ok) return
  const data = (await response.json()) as { authors: AdminAuthor[] }
  setAuthors(data.authors)
  const first = data.authors.find((author) => author.active)
  setSelected((current) =>
    current.authorSlug || !first
      ? current
      : { ...current, author: first.name, authorSlug: first.slug },
  )
}

export async function loadSettings(
  setSettings: Setter<AdminSettings>,
): Promise<void> {
  const response = await adminFetch('/api/settings')
  if (!response.ok) return
  const data = (await response.json()) as { settings: AdminSettings }
  setSettings(data.settings)
}

export async function loadAgentGuidance(
  setGuidance: Setter<AdminAgentGuidance>,
): Promise<void> {
  const response = await adminFetch('/api/agent-guidance')
  if (!response.ok) return
  const data = (await response.json()) as { agentContext: AdminAgentGuidance }
  setGuidance(data.agentContext)
}

export async function saveAgentGuidance(
  guidance: AdminAgentGuidance,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const response = await adminFetch('/api/agent-guidance', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': String(guidance.revision),
    },
    body: JSON.stringify({ instructions: guidance.instructions }),
  })
  setMessage(
    response.ok
      ? '에이전트 운영 지침을 저장했습니다.'
      : `지침 저장 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function loadPlugins(
  setPlugins: Setter<AdminPlugin[]>,
): Promise<void> {
  const response = await adminFetch('/api/plugins')
  if (!response.ok) return
  const data = (await response.json()) as { plugins: AdminPlugin[] }
  setPlugins(data.plugins)
}

export async function loadMedia(setMedia: Setter<AdminMedia[]>): Promise<void> {
  const response = await adminFetch('/api/media')
  if (!response.ok) return
  const data = (await response.json()) as { media: AdminMedia[] }
  setMedia(data.media)
}

export async function uploadMedia(
  file: File,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const form = new FormData()
  form.set('file', file)
  const response = await adminFetch('/api/media', {
    method: 'POST',
    body: form,
  })
  setMessage(
    response.ok
      ? '이미지를 업로드했습니다. 승인 후 글에 선택할 수 있습니다.'
      : `이미지 업로드 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function approveMedia(
  media: AdminMedia,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const response = await adminFetch(`/api/media/${media.id}/approve`, {
    method: 'POST',
  })
  setMessage(
    response.ok
      ? '이미지 변형을 생성하고 승인했습니다.'
      : `이미지 승인 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function configurePlugin(
  pluginId: string,
  configuration: Record<string, unknown>,
  revision: number | undefined,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const response = await adminFetch(
    revision === undefined ? '/api/plugins' : '/api/plugins/' + pluginId,
    {
      method: revision === undefined ? 'POST' : 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(revision === undefined ? {} : { 'If-Match': String(revision) }),
      },
      body: JSON.stringify(
        revision === undefined
          ? { pluginId, configuration }
          : { configuration },
      ),
    },
  )
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
  }
  setMessage(
    response.ok
      ? '플러그인 설정을 저장했습니다.'
      : '플러그인 설정 실패: ' + (payload.error ?? String(response.status)),
  )
  if (response.ok) await reload()
}

export async function validatePluginConfiguration(
  pluginId: string,
  configuration: Record<string, unknown>,
): Promise<string | undefined> {
  const response = await adminFetch('/api/plugins/' + pluginId + '/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configuration }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    valid?: boolean
    errors?: string[]
    error?: string
  }
  if (response.ok && payload.valid) return undefined
  return (
    payload.errors?.join('; ') ?? payload.error ?? 'Configuration is invalid'
  )
}

export async function setPluginState(
  pluginId: string,
  state: 'enabled' | 'disabled',
  revision: number,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const response = await adminFetch('/api/plugins/' + pluginId + '/' + state, {
    method: 'POST',
    headers: { 'If-Match': String(revision) },
  })
  setMessage(
    response.ok
      ? state === 'enabled'
        ? '플러그인을 활성화했습니다. 다음 발행부터 적용됩니다.'
        : '플러그인을 비활성화했습니다. 다음 발행부터 제거됩니다.'
      : '플러그인 상태 변경 실패 (' + String(response.status) + ').',
  )
  if (response.ok) await reload()
}

export function createPost(
  authors: AdminAuthor[],
  categories: AdminTag[],
  setSelected: Setter<AdminPost>,
  setMessage: Setter<string>,
): void {
  const firstAuthor = authors.find((author) => author.active)
  setSelected({
    ...blankPost(firstAuthor),
    categories: categories
      .filter((tag) => tag.active)
      .slice(0, 1)
      .map((tag) => tag.slug),
  })
  setMessage('새 글을 작성할 수 있습니다.')
}

export async function savePost(
  selected: AdminPost,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const isNew = !selected.id
  const response = await adminFetch(
    isNew ? '/api/posts' : `/api/posts/${selected.id}`,
    {
      method: isNew ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(isNew ? {} : { 'If-Match': String(selected.revision) }),
      },
      body: JSON.stringify(selected),
    },
  )
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string
  }
  const errorMessage =
    typeof data.error === 'string' ? data.error : data.error?.message
  setMessage(
    response.ok
      ? '콘텐츠를 저장했습니다.'
      : `저장 실패: ${errorMessage ?? response.status}`,
  )
  if (response.ok) await reload()
}

export async function removePost(
  selected: AdminPost,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  if (!selected.id || !window.confirm('이 글을 삭제할까요?')) return
  const response = await adminFetch(`/api/posts/${selected.id}`, {
    method: 'DELETE',
    headers: { 'If-Match': String(selected.revision) },
  })
  setMessage(
    response.ok ? '글을 삭제했습니다.' : `삭제 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function saveSettings(
  settings: AdminSettings,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const { revision: _revision, ...input } = settings
  const response = await adminFetch('/api/settings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': String(settings.revision),
    },
    body: JSON.stringify(input),
  })
  setMessage(
    response.ok
      ? '발행물 설정을 저장했습니다.'
      : `설정 저장 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function createAuthor(
  nameInput: string,
  setName: Setter<string>,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const name = nameInput.trim()
  if (!name) return
  const response = await adminFetch('/api/authors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, bio: `${name} contributor profile.` }),
  })
  setMessage(
    response.ok
      ? '작성자를 추가했습니다.'
      : `작성자 추가 실패 (${response.status}).`,
  )
  if (response.ok) {
    setName('')
    await reload()
  }
}

export async function editAuthor(
  author: AdminAuthor,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const name = window.prompt('작성자 이름', author.name)?.trim()
  if (!name) return
  const bio = window.prompt('작성자 소개', author.bio)?.trim()
  if (!bio) return
  const editorialPersona = window
    .prompt(
      '비공개 편집 페르소나 (에이전트 작성 지침)',
      author.editorialPersona,
    )
    ?.trim()
  if (editorialPersona === undefined) return
  const response = await adminFetch(
    `/api/authors/${encodeURIComponent(author.slug)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': String(author.revision),
      },
      body: JSON.stringify({ name, bio, editorialPersona }),
    },
  )
  setMessage(
    response.ok
      ? '작성자를 수정했습니다.'
      : `작성자 수정 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function archiveAuthor(
  author: AdminAuthor,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  if (!window.confirm(`“${author.name}” 작성자를 보관할까요?`)) return
  const response = await adminFetch(
    `/api/authors/${encodeURIComponent(author.slug)}`,
    {
      method: 'DELETE',
      headers: { 'If-Match': String(author.revision) },
    },
  )
  setMessage(
    response.ok
      ? '작성자를 보관했습니다.'
      : `작성자 보관 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function createTag(
  nameInput: string,
  setName: Setter<string>,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const name = nameInput.trim()
  if (!name) return
  const response = await adminFetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  setMessage(
    response.ok
      ? '태그를 추가했습니다.'
      : `태그 추가 실패 (${response.status}).`,
  )
  if (response.ok) {
    setName('')
    await reload()
  }
}

export async function renameTag(
  tag: AdminTag,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const name = window.prompt('새 태그 이름', tag.name)?.trim()
  if (!name || name === tag.name) return
  const response = await adminFetch(
    `/api/tags/${encodeURIComponent(tag.slug)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': String(tag.revision),
      },
      body: JSON.stringify({ name }),
    },
  )
  setMessage(
    response.ok
      ? '태그 이름을 변경했습니다.'
      : `태그 변경 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function archiveTag(
  tag: AdminTag,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  if (!window.confirm(`“${tag.name}” 태그를 보관할까요?`)) return
  const response = await adminFetch(
    `/api/tags/${encodeURIComponent(tag.slug)}`,
    {
      method: 'DELETE',
      headers: { 'If-Match': String(tag.revision) },
    },
  )
  setMessage(
    response.ok
      ? '태그를 보관했습니다.'
      : `태그 보관 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}

export async function createCategory(
  nameInput: string,
  setName: Setter<string>,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const name = nameInput.trim()
  if (!name) return
  const response = await adminFetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  setMessage(
    response.ok
      ? '분류를 추가했습니다.'
      : `분류 추가 실패 (${response.status}).`,
  )
  if (response.ok) {
    setName('')
    await reload()
  }
}
export async function renameCategory(
  category: AdminTag,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  const name = window.prompt('새 분류 이름', category.name)?.trim()
  if (!name || name === category.name) return
  const response = await adminFetch(
    `/api/categories/${encodeURIComponent(category.slug)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': String(category.revision),
      },
      body: JSON.stringify({ name }),
    },
  )
  setMessage(
    response.ok
      ? '분류 이름을 변경했습니다.'
      : `분류 변경 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}
export async function archiveCategory(
  category: AdminTag,
  setMessage: Setter<string>,
  reload: () => Promise<void>,
): Promise<void> {
  if (!window.confirm(`“${category.name}” 분류를 보관할까요?`)) return
  const response = await adminFetch(
    `/api/categories/${encodeURIComponent(category.slug)}`,
    { method: 'DELETE', headers: { 'If-Match': String(category.revision) } },
  )
  setMessage(
    response.ok
      ? '분류를 보관했습니다.'
      : `분류 보관 실패 (${response.status}).`,
  )
  if (response.ok) await reload()
}
