import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const command = path.join(root, 'packages/ops-cli/bin/publisher.mjs')

function run(args, environment = {}) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
  })
  return { status: result.status, body: JSON.parse(result.stdout) }
}

describe('agent operations CLI contract', () => {
  it('returns a versioned redacted configuration result without prompting', () => {
    const result = run(['doctor', '--json', '--non-interactive'], {
      PUBLISHER_ADMIN_ORIGIN: '',
      PUBLISHER_API_TOKEN: '',
    })
    expect(result.status).toBe(20)
    expect(result.body).toEqual({
      schemaVersion: 1,
      ok: false,
      code: 'CONFIGURATION_REQUIRED',
      missing: ['PUBLISHER_ADMIN_ORIGIN', 'PUBLISHER_API_TOKEN'],
      nonInteractive: true,
    })
    expect(JSON.stringify(result.body)).not.toContain('token')
  })

  it('does not issue a mutation when a human authority is required', () => {
    const result = run([
      'publish',
      '--json',
      '--non-interactive',
      '--requires-authority',
    ])
    expect(result.status).toBe(40)
    expect(result.body).toMatchObject({
      schemaVersion: 1,
      ok: false,
      code: 'AUTHORITY_REQUIRED',
      mutationAttempted: false,
    })
  })
})
