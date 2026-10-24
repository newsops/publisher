import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const suites = {
  '@publisher/content': [
    'content-contract',
    'html-body-import-contract',
    'desk-review-contract',
    'editorial-persona-contract',
  ],
  '@publisher/publication': [
    'incremental-publication-contract',
    'incremental-publication-scale',
    'visitor-analytics-consent-contract',
  ],
  '@publisher/persistence': [
    'portable-persistence-integration',
    'local-first-conditional-storage',
  ],
  '@publisher/admin': [
    'admin-auth-contract',
    'admin-automation-contract',
    'automation-keyrings',
    'admin-launch-root',
    'admin-site-tab-isolation',
    'admin-taxonomy-contract',
    'agent-guidance-contract',
    'agent-guidance-editor',
  ],
  '@publisher/comments': [
    'comment-handler-contract',
    'comment-moderation-contract',
    'comment-isolation-contract',
  ],
  '@publisher/site': ['browser-route-contract', 'presentation-parity-contract'],
  '@publisher/ops-cli': [
    'agent-operations-cli-contract',
    'agent-guidance-cli',
    'adapter-lifecycle-cli',
  ],
  '@publisher/operator': ['local-first-'],
}

const selection = process.argv[2]
if (process.argv.length !== 3 || !Object.hasOwn(suites, selection)) {
  console.error('Unknown test package; select a registered @publisher package')
  process.exit(2)
}

const directory = 'scripts/harness/__tests__'
const available = readdirSync(path.join(root, directory))
const files = new Set()
for (const name of suites[selection]) {
  const matches = name.endsWith('-')
    ? available.filter(
        (file) => file.startsWith(name) && file.endsWith('.test.mjs'),
      )
    : available.filter((file) => file === `${name}.test.mjs`)
  if (matches.length === 0) {
    console.error(`Missing behavior suite for ${selection}: ${name}`)
    process.exit(2)
  }
  for (const file of matches) files.add(`${directory}/${file}`)
}

console.log(`[package-tests] ${selection}: ${[...files].join(', ')}`)
const child = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.harness.config.ts',
    ...files,
  ],
  { cwd: root, stdio: 'inherit' },
)
child.once('error', () => {
  console.error('Could not start the package behavior tests')
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
