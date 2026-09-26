import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// RULE-003: the private denylist is maintained by a command that never
// prints a term. Every run uses a temporary HOME.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const command = path.join(root, 'scripts/privacy-denylist.mjs')
const homes = []

async function temporaryHome() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'privacy-denylist-'))
  homes.push(home)
  return home
}

function run(home, args, input) {
  const env = { ...process.env, HOME: home }
  delete env.PUBLISHER_PRIVATE_DENYLIST
  return spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    encoding: 'utf8',
    env,
    input,
  })
}

describe('privacy:denylist (RULE-003)', () => {
  afterAll(async () => {
    for (const home of homes) await rm(home, { recursive: true, force: true })
  })

  it('creates the private file with mode 600 and never prints terms', async () => {
    const home = await temporaryHome()
    const file = path.join(home, '.config/publisher/private-denylist.txt')

    const where = run(home, ['path'])
    expect(where.status).toBe(0)
    expect(where.stdout.trim()).toBe(file)

    expect(run(home, ['count']).stdout.trim()).toBe('0')

    const added = run(home, ['add', '  ZZ-Private-Site ', 'zz-private-desk'])
    expect(added.stderr).toBe('')
    expect(added.status).toBe(0)
    expect(added.stdout).toBe('[privacy-denylist] added 2, total 2\n')
    expect(added.stdout.toLowerCase()).not.toContain('zz-private')

    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700)
    const text = await readFile(file, 'utf8')
    expect(text.startsWith('# ')).toBe(true)
    expect(text).toContain('\nzz-private-site\nzz-private-desk\n')

    const again = run(home, ['add', 'zz-private-site', 'zz-private-news'])
    expect(again.stdout).toBe('[privacy-denylist] added 1, total 3\n')
    expect(again.stdout.toLowerCase()).not.toContain('zz-private')

    const piped = run(
      home,
      ['add', '-'],
      'zz-private-admin\n\nzz-private-desk\n',
    )
    expect(piped.stdout).toBe('[privacy-denylist] added 1, total 4\n')

    const count = run(home, ['count'])
    expect(count.stdout).toBe('4\n')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })

  it('rejects an empty add and an unknown command', async () => {
    const home = await temporaryHome()
    expect(run(home, ['add']).status).toBe(2)
    expect(run(home, ['add', '   ']).status).toBe(2)
    expect(run(home, ['list']).status).toBe(2)
  })
})
