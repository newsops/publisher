import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const output = path.join(root, 'apps/site/out')

describe('browser route contract', () => {
  it('has the desktop, mobile, category, search, and unknown-route artifacts', () => {
    for (const file of [
      'index.html',
      '2026/09/sample-report-01.html',
      'search/label/General/index.html',
      'search/index.html',
      '404.html',
    ])
      expect(fs.existsSync(path.join(output, file))).toBe(true)
  })
})
