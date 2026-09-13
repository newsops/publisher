import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

describe('delegated authority contract', () => {
  it('keeps recommendation-led implementation separate from irreversible execution', () => {
    const rule = read('.agents/rules/authority-delegation.md')
    for (const required of [
      'authority: delegated',
      'authority: confirmation-required',
      'chargeable resource or billing changes',
      'production DNS changes',
      'overwrite of existing production data',
      'backlog-gate-guard',
    ])
      expect(rule).toContain(required)
    expect(rule).toMatch(
      /new external runtime, proxy,\s*queue, cache, or managed service/,
    )
  })

  it('makes the approval gate accept delegated authority and preserve exceptions', () => {
    const guard = read('.agents/skills/backlog-gate-guard/SKILL.md')
    const pipeline = read('.agents/skills/backlog-pipeline/SKILL.md')
    const writer = read('.agents/skills/backlog-writer/SKILL.md')
    expect(guard).toContain('authority: delegated')
    expect(guard).toContain('authority: confirmation-required')
    expect(guard).toContain('현재 turn의 항목별 재승인은 요구하지 않는다')
    expect(guard).toContain('실행 시점 예외')
    expect(pipeline).toContain('standing delegation')
    expect(writer).toContain('authority: delegated | confirmation-required')
  })
})
