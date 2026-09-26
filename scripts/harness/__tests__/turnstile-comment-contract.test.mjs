import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

function fixture({ fail = false } = {}) {
  const listeners = new Map()
  const events = []
  const section = {
    querySelector: () => status,
    addEventListener: (type, listener) => listeners.set(type, listener),
    dispatchEvent: (event) => events.push(event),
  }
  const widget = {
    dataset: { turnstileSiteKey: 'public-test-site-key' },
    closest: () => section,
  }
  const status = { textContent: '' }
  const resetCalls = []
  let options
  const window = {
    turnstile: {
      render: (_widget, value) => {
        options = value
        return 17
      },
      reset: (id) => resetCalls.push(id),
    },
  }
  if (fail) delete window.turnstile
  const document = {
    querySelectorAll: () => [widget],
    createElement: () => ({}),
    head: {
      append: (script) => {
        if (fail) script.onerror()
        else script.onload()
      },
    },
  }
  return {
    document,
    events,
    listeners,
    options: () => options,
    resetCalls,
    status,
    window,
  }
}

async function execute(context) {
  const source = fs.readFileSync(
    path.join(root, 'apps/site/public/site-runtime/turnstile.v1.js'),
    'utf8',
  )
  vm.runInNewContext(source, {
    ...context,
    CustomEvent: class {
      constructor(type, init = {}) {
        this.type = type
        this.detail = init.detail
      }
    },
    Error,
    Promise,
  })
  await Promise.resolve()
  await Promise.resolve()
}

describe('optional Turnstile comment verification', () => {
  it('keeps the provider opt-in and excludes every private value from static input', () => {
    const component = fs.readFileSync(
      path.join(root, 'apps/site/app/components/CommentSection.tsx'),
      'utf8',
    )
    const headers = fs.readFileSync(
      path.join(root, 'scripts/generate-plugin-headers.mjs'),
      'utf8',
    )
    expect(component).toContain('NEXT_PUBLIC_TURNSTILE_SITE_KEY')
    expect(component).toContain(
      'COMMENT_ORIGIN && SUBMISSION_ENABLED && TURNSTILE_SITE_KEY',
    )
    expect(component).toContain('/site-runtime/turnstile.v1.js')
    expect(component).not.toContain('HUMAN_VERIFICATION_SECRET')
    expect(component).not.toContain('COMMENTS_DATABASE_URL')
    expect(headers).toContain(
      "const turnstileOrigin = 'https://challenges.cloudflare.com'",
    )
    expect(headers).toContain('frames.add(turnstileOrigin)')
    expect(headers).toContain('fs.rm(turnstileRuntimePath, { force: true })')
  })

  it('dispatches the provider-neutral token event and resets after a submission attempt', async () => {
    const context = fixture()
    await execute(context)
    expect(context.options()).toMatchObject({ sitekey: 'public-test-site-key' })
    context.options().callback('verified-token')
    expect(context.events).toContainEqual(
      expect.objectContaining({
        type: 'publisher:verification-token',
        detail: { token: 'verified-token' },
      }),
    )
    context.listeners.get('publisher:verification-reset')()
    expect(context.resetCalls).toEqual([17])
  })

  it('leaves a recoverable status when the provider script cannot load', async () => {
    const context = fixture({ fail: true })
    await execute(context)
    expect(context.status.textContent).toBe(
      'Human verification is unavailable. Try again.',
    )
  })
})
