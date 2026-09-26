#!/usr/bin/env node
// RULE-003: maintain the operator's private denylist — the terms of every
// operated publication that must never enter this repository
// (.agents/rules/repository-scope.md). The file lives outside the repository:
// `PUBLISHER_PRIVATE_DENYLIST`, or `~/.config/publisher/private-denylist.txt`.
// No command prints a term, so the output is safe for transcripts and logs.
//
//   privacy:denylist add <term...>   append normalised, unique terms
//   privacy:denylist add -           read terms from stdin, one per line
//   privacy:denylist count           number of terms
//   privacy:denylist path            the file path
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tag = '[privacy-denylist]'
const header =
  '# Publisher private denylist: one case-insensitive term per line.\n' +
  '# Never commit this file. Also set it as the PUBLISHER_PRIVATE_DENYLIST_TEXT\n' +
  '# Actions secret of your repository.\n'

const file =
  process.env.PUBLISHER_PRIVATE_DENYLIST ||
  path.join(os.homedir(), '.config/publisher/private-denylist.txt')

const normalise = (terms) =>
  terms
    .flatMap((term) => term.split(/\r?\n/))
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term && !term.startsWith('#'))

function readTerms() {
  if (!fs.existsSync(file)) return []
  return normalise([fs.readFileSync(file, 'utf8')])
}

function usage() {
  console.error(
    `${tag} usage: privacy:denylist add <term...> | add - | count | path`,
  )
  process.exit(2)
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'path') {
  console.log(file)
} else if (command === 'count') {
  console.log(String(readTerms().length))
} else if (command === 'add') {
  const input =
    rest.length === 1 && rest[0] === '-' ? [fs.readFileSync(0, 'utf8')] : rest
  const requested = [...new Set(normalise(input))]
  if (requested.length === 0) usage()
  const existing = readTerms()
  const known = new Set(existing)
  const added = requested.filter((term) => !known.has(term))
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  if (!fs.existsSync(file))
    fs.writeFileSync(file, header, { encoding: 'utf8', mode: 0o600 })
  if (added.length > 0) {
    const current = fs.readFileSync(file, 'utf8')
    const separator = current === '' || current.endsWith('\n') ? '' : '\n'
    fs.appendFileSync(file, `${separator}${added.join('\n')}\n`, 'utf8')
  }
  fs.chmodSync(file, 0o600)
  console.log(
    `${tag} added ${added.length}, total ${existing.length + added.length}`,
  )
} else {
  usage()
}
