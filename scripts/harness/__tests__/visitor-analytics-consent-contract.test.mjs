import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { googleAnalyticsRuntimeSource } from '../../../packages/content/src/plugins/google-analytics.ts'
import { consentRuntimeSource } from '../../../packages/publication/src/static-runtime-recipes.ts'

/**
 * SECURITY-002: analytics consent is opt-in. The platform consent layer is the
 * only thing that may grant it, an absent or denied preference must leave the
 * Google tag unloaded, and the choice survives a reload and stays idempotent.
 *
 * The two runtime sources are executed against the minimal DOM below — the
 * same source strings the static release ships, not a re-implementation.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

const CONSENT_KEY = 'publisher.consent.analytics'

function matches(element, selector) {
  const [, tag, attribute, , value] =
    /^([a-z0-9-]*)(?:\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\])?$/.exec(selector) ?? []
  const [, className] = /^\.([a-zA-Z0-9_-]+)$/.exec(selector) ?? []
  if (className !== undefined)
    return element.className.split(/\s+/).includes(className)
  if (tag && element.tagName !== tag) return false
  if (!attribute) return Boolean(tag)
  const held = element.getAttribute(attribute)
  if (held === null) return false
  return value === undefined || held === value
}

class StubElement {
  constructor(tagName) {
    this.tagName = tagName
    this.children = []
    this.parent = undefined
    this.attributes = new Map()
    this.dataset = new Proxy(
      {},
      {
        set: (target, key, value) => {
          target[key] = value
          this.attributes.set(
            `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
            String(value),
          )
          return true
        },
        get: (target, key) => target[key],
      },
    )
    this.listeners = new Map()
    this.className = ''
    this.textContent = ''
    this.hidden = false
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  getAttribute(name) {
    if (name === 'class') return this.className
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parent = this
      this.children.push(node)
    }
  }

  remove() {
    if (!this.parent) return
    this.parent.children = this.parent.children.filter((node) => node !== this)
    this.parent = undefined
  }

  get descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants])
  }

  querySelector(selector) {
    return this.descendants.find((node) => matches(node, selector)) ?? null
  }

  querySelectorAll(selector) {
    return this.descendants.filter((node) => matches(node, selector))
  }

  addEventListener(type, handler) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler])
  }

  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) ?? []) handler(event)
  }

  click() {
    this.dispatchEvent({ type: 'click' })
  }
}

/** A document/window pair just wide enough for both runtime sources. */
function createPage({ measurementId = 'G-ABC12345', stored } = {}) {
  const store = new Map()
  if (stored !== undefined) store.set(CONSENT_KEY, stored)
  const documentElement = new StubElement('html')
  const head = new StubElement('head')
  const body = new StubElement('body')
  documentElement.append(head, body)
  if (measurementId) {
    const meta = new StubElement('meta')
    meta.setAttribute('name', 'publisher-google-analytics-id')
    meta.setAttribute('content', measurementId)
    head.append(meta)
  }
  const footerBar = new StubElement('div')
  footerBar.className = 'container footer-bar-inner'
  body.append(footerBar)

  const documentStub = {
    head,
    body,
    documentElement,
    createElement: (tagName) => new StubElement(tagName),
    querySelector: (selector) => documentElement.querySelector(selector),
    querySelectorAll: (selector) => documentElement.querySelectorAll(selector),
    addEventListener: (...args) => documentElement.addEventListener(...args),
  }
  const windowStub = new StubElement('window')
  Object.assign(windowStub, {
    document: documentStub,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  })
  return { window: windowStub, document: documentStub, store, footerBar }
}

function evaluate(page, source) {
  const run = new Function(
    'window',
    'document',
    'localStorage',
    'CustomEvent',
    'Event',
    source,
  )
  run(
    page.window,
    page.document,
    page.window.localStorage,
    class CustomEvent {
      constructor(type, options) {
        this.type = type
        this.detail = options?.detail
      }
    },
    class Event {
      constructor(type) {
        this.type = type
      }
    },
  )
}

/** Loads the consent layer first, then the async Google Analytics runtime. */
function load(page, { order = 'consent-first' } = {}) {
  const sources =
    order === 'consent-first'
      ? [consentRuntimeSource, googleAnalyticsRuntimeSource]
      : [googleAnalyticsRuntimeSource, consentRuntimeSource]
  for (const source of sources) evaluate(page, source)
}

const tagCount = (page) =>
  page.document.querySelectorAll('script[data-publisher-google-analytics]')
    .length
const layer = (page) => page.document.querySelector('[data-consent-layer]')
const control = (page, name) =>
  page.document.querySelector(`[data-consent-${name}]`)

describe('visitor analytics consent (SECURITY-002)', () => {
  let page

  beforeEach(() => {
    page = createPage()
  })

  it('TC-01: renders the layer and loads no tag while no preference is stored', () => {
    load(page)
    expect(layer(page)).not.toBeNull()
    expect(control(page, 'allow')).not.toBeNull()
    expect(control(page, 'reject')).not.toBeNull()
    expect(control(page, 'settings')).not.toBeNull()
    expect(tagCount(page)).toBe(0)
    expect(page.window.__publisherConsent?.analytics).not.toBe(true)
  })

  it('TC-02: a rejection persists, survives a reload, and leaves a reopen control', () => {
    load(page)
    control(page, 'reject').click()
    expect(page.store.get(CONSENT_KEY)).toBe('denied')
    expect(tagCount(page)).toBe(0)
    expect(layer(page)).toBeNull()
    expect(page.footerBar.querySelector('[data-consent-reopen]')).not.toBeNull()

    const reloaded = createPage({ stored: 'denied' })
    load(reloaded)
    expect(layer(reloaded)).toBeNull()
    expect(tagCount(reloaded)).toBe(0)
    expect(
      reloaded.footerBar.querySelector('[data-consent-reopen]'),
    ).not.toBeNull()
  })

  it('TC-02: the reopen control brings the layer back so the choice is reversible', () => {
    const denied = createPage({ stored: 'denied' })
    load(denied)
    denied.footerBar.querySelector('[data-consent-reopen]').click()
    expect(layer(denied)).not.toBeNull()
    control(denied, 'allow').click()
    expect(denied.store.get(CONSENT_KEY)).toBe('granted')
    expect(tagCount(denied)).toBe(1)
  })

  it('TC-03: allowing loads exactly one tag with the configured measurement ID', () => {
    load(page)
    control(page, 'allow').click()
    expect(page.store.get(CONSENT_KEY)).toBe('granted')
    expect(page.window.__publisherConsent.analytics).toBe(true)
    expect(tagCount(page)).toBe(1)
    const tag = page.document.querySelector(
      'script[data-publisher-google-analytics]',
    )
    expect(tag.src).toContain('id=G-ABC12345')
  })

  it('TC-03: repeated allowance and a reload never duplicate the tag', () => {
    load(page)
    control(page, 'allow').click()
    control(page, 'reopen').click()
    control(page, 'allow').click()
    expect(tagCount(page)).toBe(1)

    const reloaded = createPage({ stored: 'granted' })
    load(reloaded)
    expect(tagCount(reloaded)).toBe(1)
    expect(layer(reloaded)).toBeNull()
  })

  it('TC-03: a stored grant loads the tag whichever runtime executes first', () => {
    const consentFirst = createPage({ stored: 'granted' })
    load(consentFirst, { order: 'consent-first' })
    expect(tagCount(consentFirst)).toBe(1)

    const analyticsFirst = createPage({ stored: 'granted' })
    load(analyticsFirst, { order: 'analytics-first' })
    expect(tagCount(analyticsFirst)).toBe(1)
  })

  it('stays inert when the site configures no measurement ID', () => {
    const plain = createPage({ measurementId: null })
    load(plain)
    control(plain, 'allow').click()
    expect(plain.store.get(CONSENT_KEY)).toBe('granted')
    expect(tagCount(plain)).toBe(0)
  })

  it('keeps working when localStorage throws, without granting consent', () => {
    const sealed = createPage()
    sealed.window.localStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    load(sealed)
    expect(layer(sealed)).not.toBeNull()
    expect(tagCount(sealed)).toBe(0)
    control(sealed, 'allow').click()
    expect(tagCount(sealed)).toBe(1)
  })

  it('ships the same consent runtime to the release and the preview export', () => {
    expect(read('apps/site/public/site-runtime/consent.v1.js').trim()).toBe(
      consentRuntimeSource.trim(),
    )
    expect(read('apps/site/app/layout.tsx')).toContain(
      '/site-runtime/consent.v1.js',
    )
    expect(read('packages/publication/src/static-renderers.ts')).toContain(
      '/site-runtime/consent.v1.js',
    )
  })

  it('never treats an absent preference as consent in either runtime source', () => {
    for (const source of [
      googleAnalyticsRuntimeSource,
      read('apps/site/public/plugin-runtime/google-analytics.js'),
    ]) {
      expect(source).toContain('analytics === true')
      expect(source).not.toContain('analytics !== false')
    }
  })
})
