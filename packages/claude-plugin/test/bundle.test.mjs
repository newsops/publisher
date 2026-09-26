import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const bundle = path.join(packageRoot, 'bin/publisher')

// Spawned asynchronously (not spawnSync): a couple of these tests run the
// CLI against an HTTP server started in this same process. spawnSync blocks
// this process's whole event loop until the child exits, so that server
// could never service the child's request — the child would hang until its
// fetch's own timeout fired. spawn() keeps this process's event loop free
// while the child runs.
function run(args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], {
      env: { PATH: process.env.PATH, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (status, signal) => {
      try {
        resolve({ status, stdout, body: JSON.parse(stdout) })
      } catch {
        reject(
          new Error(
            `bundle did not print JSON (exit ${status}, signal ${signal}): ${stderr || stdout}`,
          ),
        )
      }
    })
  })
}

async function withServer(handler, callback) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    return await callback(origin)
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
}

describe('bundled publisher CLI (PLUG-001)', () => {
  it('is a self-contained node script', async () => {
    const source = await readFile(bundle, 'utf8')
    expect(source.startsWith('#!/usr/bin/env node\n')).toBe(true)
    const bare = [...source.matchAll(/^import .* from ["']([^"']+)["']/gm)]
      .map((match) => match[1])
      .filter((specifier) => !specifier.startsWith('node:'))
    expect(bare).toEqual([])
    expect(source).not.toMatch(/require\(["'](?!node:)/)
    // Proves the content-stub alias made it into the bundle: this string
    // only exists in scripts/content-stub.mjs, not in the workspace CLI.
    expect(source).toContain(
      'archive validation is not bundled in the plugin CLI',
    )
  })

  it('prints the USAGE envelope without arguments', async () => {
    const { status, body } = await run(['--json'])
    expect(status).toBe(10)
    expect(body.code).toBe('USAGE')
    expect(body.commands).toContain(
      'desk report --site <id> --post <post-id> --json',
    )
  })

  it('reports missing configuration instead of guessing', async () => {
    const { status, body } = await run([
      'desk',
      'report',
      '--site',
      's',
      '--post',
      'p',
      '--json',
    ])
    expect(status).toBe(20)
    expect(body.code).toBe('CONFIGURATION_REQUIRED')
    expect(body.missing).toEqual([
      'PUBLISHER_ADMIN_ORIGIN',
      'PUBLISHER_API_TOKEN',
    ])
  })

  it('calls the documented desk route with a bearer header and never echoes the token', async () => {
    const calls = []
    const token = 'secret-token-value'
    await withServer(
      (request, response) => {
        calls.push({
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
        })
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({ siteId: 's', postId: 'p', report: { checks: [] } }),
        )
      },
      async (origin) => {
        const { status, body, stdout } = await run(
          ['desk', 'report', '--site', 's', '--post', 'p', '--json'],
          { PUBLISHER_ADMIN_ORIGIN: origin, PUBLISHER_API_TOKEN: token },
        )
        expect(status).toBe(0)
        expect(body.ok).toBe(true)
        expect(body.code).toBe('DESK_REPORT')
        expect(stdout).not.toContain(token)
      },
    )
    expect(calls).toEqual([
      {
        method: 'GET',
        url: '/api/v2/sites/s/posts/p/desk',
        authorization: `Bearer ${token}`,
      },
    ])
  })

  it('reports that archive validation is not bundled', async () => {
    const archiveDir = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-plugin-archive-'),
    )
    try {
      await writeFile(path.join(archiveDir, 'archive.json'), '{}', 'utf8')
      const { body } = await run([
        'content',
        'inspect',
        '--archive',
        archiveDir,
        '--json',
      ])
      expect(body.code).toBe('ARCHIVE_INVALID')
    } finally {
      await rm(archiveDir, { recursive: true, force: true })
    }
  })
})
