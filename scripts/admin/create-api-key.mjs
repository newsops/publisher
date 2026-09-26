#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto'

const id = process.argv[2]
const role = process.argv[3] ?? 'editor'

if (!id || !/^[a-z0-9][a-z0-9-]{1,31}$/.test(id)) {
  console.error(
    'Usage: node scripts/admin/create-api-key.mjs <id> [editor|publisher]',
  )
  process.exit(1)
}
if (role !== 'editor' && role !== 'publisher') {
  console.error('Role must be editor or publisher')
  process.exit(1)
}

const token = `xrtn_${randomBytes(32).toString('base64url')}`
const sha256 = createHash('sha256').update(token).digest('hex')

console.log(
  JSON.stringify(
    {
      token,
      record: { id, role, sha256 },
      envFragment: `ADMIN_AUTOMATION_KEYS='${JSON.stringify([{ id, role, sha256 }])}'`,
    },
    null,
    2,
  ),
)
