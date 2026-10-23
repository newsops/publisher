import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadAgentGuidance,
  saveAgentGuidance,
} from '../../../apps/admin/app/admin-actions.ts'

afterEach(() => vi.unstubAllGlobals())
describe('ADMIN-002 human guidance editor', () => {
  it('preserves the unsaved draft on a revision conflict rather than implicitly reloading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'changed' }, { status: 409 })),
    )
    const draft = { instructions: 'My unsaved instructions', revision: 2 }
    const reload = vi.fn()
    const message = vi.fn()
    const result = await saveAgentGuidance(draft, message, reload)
    expect(result).toEqual({ kind: 'conflict' })
    expect(draft).toEqual({
      instructions: 'My unsaved instructions',
      revision: 2,
    })
    expect(reload).not.toHaveBeenCalled()
  })

  it('only reloads after a successful explicit save, including clearing the text', async () => {
    const fetch = vi.fn(async (_url, init) => {
      expect(init.headers.get('if-match')).toBe('2')
      expect(JSON.parse(init.body)).toEqual({ instructions: '' })
      return Response.json({ agentContext: { instructions: '', revision: 3 } })
    })
    vi.stubGlobal('fetch', fetch)
    const reload = vi.fn()
    expect(
      await saveAgentGuidance(
        { instructions: '', revision: 2 },
        vi.fn(),
        reload,
      ),
    ).toEqual({ kind: 'saved' })
    expect(reload).toHaveBeenCalledOnce()
  })

  it('returns the latest context for an explicit conflict comparison/reapply action', async () => {
    const latest = { instructions: 'Server version', revision: 5 }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ agentContext: latest })),
    )
    const set = vi.fn()
    expect(await loadAgentGuidance(set)).toEqual(latest)
    expect(set).toHaveBeenCalledWith(latest)
  })
})
