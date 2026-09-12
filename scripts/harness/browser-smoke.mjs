#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const chromeBinary = process.env.CHROME_BIN ?? 'google-chrome'
const publicOrigin =
  process.env.PUBLIC_BROWSER_ORIGIN ?? 'http://127.0.0.1:3000'
const adminOrigin = process.env.ADMIN_BROWSER_ORIGIN ?? 'http://127.0.0.1:3101'
const adminToken = process.env.ADMIN_DEV_TOKEN
const publicBrowserOnly = process.env.PUBLIC_BROWSER_ONLY === '1'
const checkCommentOutage = process.env.CHECK_COMMENT_OUTAGE === '1'
const checkGoogleAnalytics = process.env.CHECK_GOOGLE_ANALYTICS === '1'
if (!adminToken && !publicBrowserOnly)
  throw new Error('ADMIN_DEV_TOKEN is required for admin browser checks')

const profile = await mkdtemp(path.join(os.tmpdir(), 'xrtn-chrome-'))
const debuggingPort = 19225
const chrome = spawn(
  chromeBinary,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function waitForChrome() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${debuggingPort}/json/version`,
      )
      if (response.ok) return
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Chrome DevTools endpoint did not start')
}

function cdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  let nextId = 1
  const pending = new Map()
  const events = []
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data)
    if (payload.id) {
      const handler = pending.get(payload.id)
      pending.delete(payload.id)
      if (payload.error) handler?.reject(new Error(payload.error.message))
      else handler?.resolve(payload.result)
    } else events.push(payload)
  })
  return {
    async send(method, params = {}) {
      await opened
      const id = nextId++
      const result = new Promise((resolve, reject) =>
        pending.set(id, { resolve, reject }),
      )
      socket.send(JSON.stringify({ id, method, params }))
      return result
    },
    events,
    close: () => socket.close(),
  }
}

async function inspect(
  name,
  url,
  width,
  height,
  headers = {},
  expectedStatus = 200,
  expectedFocusable = true,
  resilienceMode,
  googleAnalyticsMode,
  javascriptMode = 'enabled',
  staticRuntimeMode = 'available',
) {
  const authenticatedAdmin = Object.keys(headers).length > 0
  const targetResponse = await fetch(
    `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  )
  const target = await targetResponse.json()
  const client = cdp(target.webSocketDebuggerUrl)
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Network.enable')
  if (javascriptMode === 'disabled')
    await client.send('Emulation.setScriptExecutionDisabled', { value: true })
  if (staticRuntimeMode === 'blocked')
    await client.send('Network.setBlockedURLs', {
      urls: [
        `${publicOrigin}/.well-known/publisher/runtime.json`,
        `${publicOrigin}/theme-runtime/*`,
        `${publicOrigin}/site-runtime/*`,
        `${publicOrigin}/data/*`,
      ],
    })
  const fixtureUrl = `${publicOrigin}/__plugin-resilience-fixture.js`
  if (resilienceMode === 'blocked')
    await client.send('Network.setBlockedURLs', { urls: [fixtureUrl] })
  if (googleAnalyticsMode === 'blocked')
    await client.send('Network.setBlockedURLs', {
      urls: ['https://www.googletagmanager.com/gtag/*'],
    })
  if (googleAnalyticsMode === 'blocked')
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.__publisherConsent = { analytics: true }',
    })
  if (resilienceMode && resilienceMode !== 'consent-off') {
    const fixtureSource =
      resilienceMode === 'failed'
        ? `${publicOrigin}/__plugin-resilience-missing.js`
        : fixtureUrl
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded', () => {
        const fixture = document.createElement('script')
        fixture.async = true
        fixture.dataset.pluginResilience = ${JSON.stringify(resilienceMode)}
        fixture.src = ${JSON.stringify(fixtureSource)}
        fixture.addEventListener('load', () => { window.__pluginResilience = 'loaded' })
        fixture.addEventListener('error', () => { window.__pluginResilience = ${JSON.stringify(resilienceMode)} })
        document.head.append(fixture)
      })`,
    })
  }
  if (name === 'article-desktop')
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source:
        "window.__largestContentfulPaint = null; new PerformanceObserver((list) => { const entry = list.getEntries().at(-1); if (entry) window.__largestContentfulPaint = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });",
    })
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 500,
  })
  if (Object.keys(headers).length > 0)
    await client.send('Network.setExtraHTTPHeaders', { headers })
  await client.send('Page.navigate', { url })

  let state
  if (javascriptMode === 'disabled') {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (client.events.some((event) => event.method === 'Page.loadEventFired'))
        break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await client.send('Emulation.setScriptExecutionDisabled', { value: false })
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const result = await client.send('Runtime.evaluate', {
      expression: `({ ready: document.readyState, title: document.title, text: document.body?.innerText ?? '', width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, hydrated: ${authenticatedAdmin ? "document.querySelectorAll('.post-row').length > 0 && document.querySelector('.eyebrow')?.textContent !== 'PUBLICATION'" : 'true'} })`,
      returnByValue: true,
    })
    state = result.result.value
    if (state.ready === 'complete' && state.text.length > 20 && state.hydrated)
      break
  }
  await new Promise((resolve) => setTimeout(resolve, 600))
  let pluginDiagnostic = false
  if (name === 'admin-desktop') {
    const diagnostic = await client.send('Runtime.evaluate', {
      expression:
        "new Promise((resolve) => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Validate configuration'); button?.click(); setTimeout(() => resolve(Boolean(document.querySelector('.field-error'))), 600) })",
      awaitPromise: true,
      returnByValue: true,
    })
    pluginDiagnostic = diagnostic.result.value === true
    if (!pluginDiagnostic)
      throw new Error('admin-desktop did not display plugin field validation')
  }
  if (checkCommentOutage && name === 'article-desktop') {
    await client.send('Runtime.evaluate', {
      expression: "document.querySelector('[data-comments]')?.scrollIntoView()",
    })
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
  const result = await client.send('Runtime.evaluate', {
    expression: `(() => { const focusable = document.querySelector('a[href], button, input, select, textarea'); focusable?.focus(); return { title: document.title, text: document.body.innerText, width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, authorLink: Boolean(document.querySelector('a[href="/author/example-editor/"]')), settingsPanel: Boolean([...document.querySelectorAll('h2')].find((item) => item.textContent === 'Publication settings')), pluginPanel: Boolean([...document.querySelectorAll('h2')].find((item) => item.textContent === 'Publication plugins')), postCount: document.querySelectorAll('.post-row').length, brand: document.querySelector('.eyebrow')?.textContent, keyboardFocus: Boolean(focusable && document.activeElement === focusable), commentsUnavailable: document.querySelector('[data-comments] [data-comment-status]')?.textContent === 'Comments are temporarily unavailable.', largestContentfulPaint: window.__largestContentfulPaint ?? performance.getEntriesByType('largest-contentful-paint').at(-1)?.startTime ?? null, resilienceState: window.__pluginResilience ?? 'not-injected', resilienceScriptCount: document.querySelectorAll('script[data-plugin-resilience]').length, analyticsTagCount: document.querySelectorAll('script[data-publisher-google-analytics]').length, analyticsRuntime: Boolean(document.querySelector('script[src="/plugin-runtime/google-analytics.js"]')), description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '', links: [...document.querySelectorAll('a[href]')].map((item) => new URL(item.href, location.href).href).filter((href) => new URL(href).origin === location.origin) } })()`,
    returnByValue: true,
  })
  state = result.result.value
  const documentResponses = client.events.filter(
    (event) =>
      event.method === 'Network.responseReceived' &&
      event.params.type === 'Document',
  )
  const documentStatus = documentResponses.at(-1)?.params.response.status
  const failures = client.events.filter(
    (event) =>
      event.method === 'Runtime.exceptionThrown' ||
      (event.method === 'Runtime.consoleAPICalled' &&
        event.params.type === 'error'),
  )
  if (state.width > state.viewport + 1)
    throw new Error(
      `${name} has horizontal overflow: ${state.width}/${state.viewport}`,
    )
  if (failures.length > 0)
    throw new Error(
      `${name} emitted ${failures.length} browser errors: ${JSON.stringify(failures)}`,
    )
  if (
    checkCommentOutage &&
    name === 'article-desktop' &&
    !state.commentsUnavailable
  )
    throw new Error(`${name} did not render the comment unavailable state`)
  if (documentStatus !== expectedStatus)
    throw new Error(
      `${name} returned document status ${documentStatus}; expected ${expectedStatus}`,
    )
  if (expectedFocusable && !state.keyboardFocus)
    throw new Error(`${name} has no programmatically focusable control or link`)
  if (!authenticatedAdmin && !state.description)
    throw new Error(`${name} is missing static SEO description metadata`)
  if (resilienceMode === 'consent-off' && state.resilienceScriptCount !== 0)
    throw new Error(`${name} loaded a plugin despite consent being off`)
  if (
    resilienceMode &&
    resilienceMode !== 'consent-off' &&
    state.resilienceState !== resilienceMode
  )
    throw new Error(
      `${name} did not degrade after ${resilienceMode} plugin fixture: ${state.resilienceState}`,
    )
  if (googleAnalyticsMode === 'consent-off' && state.analyticsTagCount !== 0)
    throw new Error(`${name} loaded Google Analytics before consent`)
  if (
    googleAnalyticsMode === 'blocked' &&
    (!state.analyticsRuntime || state.analyticsTagCount !== 1)
  )
    throw new Error(
      `${name} did not attempt the consented Google Analytics tag`,
    )
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  const screenshotPath = path.join(os.tmpdir(), `web004-${name}.png`)
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
  client.close()
  return {
    name,
    url,
    viewport: `${width}x${height}`,
    title: state.title,
    authorLink: state.authorLink,
    settingsPanel: state.settingsPanel,
    pluginPanel: state.pluginPanel,
    pluginDiagnostic,
    postCount: state.postCount,
    brand: state.brand,
    documentStatus,
    keyboardFocus: state.keyboardFocus,
    links: state.links,
    horizontalOverflow: false,
    consoleErrors: 0,
    commentsUnavailable: state.commentsUnavailable,
    resilienceMode: resilienceMode ?? 'none',
    resilienceState: state.resilienceState,
    googleAnalyticsMode: googleAnalyticsMode ?? 'none',
    javascriptMode,
    staticRuntimeMode,
    analyticsRuntime: state.analyticsRuntime,
    analyticsTagCount: state.analyticsTagCount,
    largestContentfulPaint: state.largestContentfulPaint,
    screenshot: screenshotPath,
  }
}

try {
  await waitForChrome()
  const adminHeaders = adminToken
    ? {
        'x-admin-dev-token': adminToken,
        'x-admin-dev-email': 'browser-check@localhost',
      }
    : {}
  const results = []
  results.push(
    await inspect('public-desktop', `${publicOrigin}/`, 1440, 1000),
    await inspect(
      'article-desktop',
      `${publicOrigin}/2026/09/sample-report-01.html`,
      1440,
      1000,
    ),
    await inspect(
      'article-plugin-consent-off-desktop',
      `${publicOrigin}/2026/09/sample-report-01.html`,
      1440,
      1000,
      {},
      200,
      true,
      'consent-off',
    ),
    await inspect(
      'article-plugin-blocked-desktop',
      `${publicOrigin}/2026/09/sample-report-01.html`,
      1440,
      1000,
      {},
      200,
      true,
      'blocked',
    ),
    await inspect(
      'article-plugin-failed-mobile',
      `${publicOrigin}/2026/09/sample-report-01.html`,
      390,
      844,
      {},
      200,
      true,
      'failed',
    ),
    ...(checkGoogleAnalytics
      ? [
          await inspect(
            'article-google-analytics-consent-off-desktop',
            `${publicOrigin}/2026/09/sample-report-01.html`,
            1440,
            1000,
            {},
            200,
            true,
            undefined,
            'consent-off',
          ),
          await inspect(
            'article-google-analytics-blocked-mobile',
            `${publicOrigin}/2026/09/sample-report-01.html`,
            390,
            844,
            {},
            200,
            true,
            undefined,
            'blocked',
          ),
        ]
      : []),
    await inspect(
      'category-desktop',
      `${publicOrigin}/search/label/General/`,
      1440,
      1000,
    ),
    await inspect('search-desktop', `${publicOrigin}/search/`, 1440, 1000),
    await inspect(
      'author-mobile',
      `${publicOrigin}/author/example-editor/`,
      390,
      844,
    ),
    await inspect('public-mobile', `${publicOrigin}/`, 390, 844),
    await inspect(
      'article-no-javascript-mobile',
      `${publicOrigin}/2026/09/sample-report-01.html`,
      390,
      844,
      {},
      200,
      true,
      undefined,
      undefined,
      'disabled',
    ),
    await inspect(
      'article-static-runtime-blocked-mobile',
      `${publicOrigin}/2026/09/sample-report-01.html`,
      390,
      844,
      {},
      200,
      true,
      undefined,
      undefined,
      'enabled',
      'blocked',
    ),
    await inspect(
      'unknown-route',
      `${publicOrigin}/browser-contract-not-found/`,
      1440,
      1000,
      {},
      404,
      false,
    ),
    ...(publicBrowserOnly
      ? []
      : [
          await inspect(
            'admin-desktop',
            `${adminOrigin}/`,
            1440,
            1200,
            adminHeaders,
          ),
          await inspect(
            'admin-mobile',
            `${adminOrigin}/`,
            390,
            844,
            adminHeaders,
          ),
        ]),
  )
  if (!results.find((result) => result.name === 'article-desktop')?.authorLink)
    throw new Error('Article author link is missing')
  if (!publicBrowserOnly)
    for (const name of ['admin-desktop', 'admin-mobile'])
      if (
        !results.find((result) => result.name === name)?.settingsPanel ||
        !results.find((result) => result.name === name)?.pluginPanel ||
        !results.find((result) => result.name === name)?.postCount
      )
        throw new Error(
          `${name} did not finish loading authenticated content: ${JSON.stringify(results.find((result) => result.name === name))}`,
        )
  const publicLinks = [
    ...new Set(
      results
        .filter((result) => result.url.startsWith(publicOrigin))
        .flatMap((result) => result.links)
        .map((href) => href.replace(/#.*$/, '')),
    ),
  ]
  for (const href of publicLinks) {
    const response = await fetch(href)
    if (!response.ok)
      throw new Error(`Public link returned ${response.status}: ${href}`)
  }
  for (const feedPath of [
    '/feed.xml',
    '/feeds/posts/default.xml',
    '/sitemap.xml',
  ]) {
    const response = await fetch(`${publicOrigin}${feedPath}`)
    const body = await response.text()
    if (!response.ok || !body.startsWith('<?xml'))
      throw new Error(
        `Static feed or sitemap is unavailable after plugin fixture checks: ${feedPath}`,
      )
  }
  for (const result of results) delete result.links
  console.log(JSON.stringify(results, null, 2))
} finally {
  chrome.kill('SIGTERM')
  await new Promise((resolve) => {
    chrome.once('exit', resolve)
    setTimeout(resolve, 2_000)
  })
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
