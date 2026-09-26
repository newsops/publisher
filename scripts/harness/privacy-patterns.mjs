// RULE-002/RULE-003: the patterns every privacy guard shares — the tracked
// file scan, the commit-message and pull-request text scan, and the GitHub
// records check. Denylist terms are loaded from a file outside the
// repository and never printed; `redactor` masks them in any output.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Placeholder segments that stand for "some user" rather than a real one.
const placeholderUsers = new Set([
  'me',
  'you',
  'user',
  'username',
  'name',
  'runner',
  'example',
  'someone',
])
const isPlaceholderUser = (name) =>
  /^[<{$%[]/.test(name) || placeholderUsers.has(name.toLowerCase())
const isPlaceholderHost = (label) =>
  /^[<{$[]/.test(label) || /^(example|your)(-|$)/i.test(label)

export const hostingDomains =
  'vercel\\.app|pages\\.dev|workers\\.dev|netlify\\.app|fly\\.dev|onrender\\.com|herokuapp\\.com'
const mailDomains =
  'gmail\\.com|googlemail\\.com|naver\\.com|daum\\.net|hanmail\\.net|kakao\\.com|yahoo\\.[a-z]{2,3}(?:\\.[a-z]{2})?|outlook\\.com|hotmail\\.com|live\\.com|icloud\\.com|me\\.com|proton\\.me|protonmail\\.com'

/** Matches a whole hostname that is a hosting provider's default host. */
export const hostingHostPattern = new RegExp(
  `^(?:[\\w-]+\\.)+(?:${hostingDomains})$`,
  'i',
)

/** Generic checks: each yields matched text when the line violates it. */
export const genericChecks = [
  {
    kind: 'home path',
    pattern: /(?<![\w.~-])\/(?:Users|home)\/([^/\s'"`)<>]+|<[^>/]+>)\//g,
    allowed: (match) => isPlaceholderUser(match[1]),
  },
  {
    kind: 'home path',
    pattern: /\b[A-Za-z]:\\{1,2}Users\\{1,2}([^\\\s'"`]+)\\/g,
    allowed: (match) => isPlaceholderUser(match[1]),
  },
  {
    kind: 'personal mail',
    pattern: new RegExp(
      `[\\w.+-]+@(?:${mailDomains})(?![\\w-]|\\.[a-z])`,
      'gi',
    ),
    allowed: () => false,
  },
  {
    kind: 'hosting host',
    pattern: new RegExp(
      `(?<![\\w.-])((?:[\\w<>{}$\\[\\]-]+\\.)+)(?:${hostingDomains})(?![\\w-])`,
      'gi',
    ),
    allowed: (match) => isPlaceholderHost(match[1].split('.')[0]),
  },
]

/** The denylist file path: `PUBLISHER_PRIVATE_DENYLIST` or the default. */
export function denylistPath() {
  return (
    process.env.PUBLISHER_PRIVATE_DENYLIST ||
    path.join(os.homedir(), '.config/publisher/private-denylist.txt')
  )
}

/** Normalised terms (trimmed, lower-case, no comments or blanks). */
export function parseDenylist(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((term) => term.toLowerCase())
}

/**
 * The operator's denylist, or `undefined` when no file exists. A configured
 * `PUBLISHER_PRIVATE_DENYLIST` that does not exist exits 2: a mistyped path
 * must not silently downgrade to generic checks.
 */
export function loadDenylist(tag) {
  const configured = process.env.PUBLISHER_PRIVATE_DENYLIST
  const file = denylistPath()
  if (!fs.existsSync(file)) {
    if (configured) {
      console.error(`${tag} PUBLISHER_PRIVATE_DENYLIST does not exist`)
      process.exit(2)
    }
    return undefined
  }
  return parseDenylist(fs.readFileSync(file, 'utf8'))
}

/** Returns a function that replaces every denylist term with `***`. */
export function redactor(denylist) {
  return (text) => {
    if (!denylist) return text
    let result = text
    for (const term of denylist) {
      let index = result.toLowerCase().indexOf(term)
      while (index >= 0) {
        result = `${result.slice(0, index)}***${result.slice(index + term.length)}`
        index = result.toLowerCase().indexOf(term, index + 3)
      }
    }
    return result
  }
}

/** Environment without Git hook variables (GIT_DIR, GIT_INDEX_FILE, …). */
export function gitFreeEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  )
}
