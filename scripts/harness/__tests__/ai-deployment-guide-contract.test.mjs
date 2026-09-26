import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const guidePath = path.join(root, 'docs/ai-assisted-deployment.ko.md')
const guide = fs.readFileSync(guidePath, 'utf8')

const criticalGuideMarkers = [
  '> 가이드 상태: `pilot-pending`',
  '> 최초 검증 고객: 저장소 소유자',
  '## 현재 배포 가능 상태',
  '## 선택 인터뷰',
  '### 1. 목표와 비용',
  '`free-only`',
  '`free-allowance-with-billing`',
  '`paid-approved`',
  '## 비용·신뢰성 게이트',
  '`UNVERIFIED`',
  '## 비밀이 없는 배포 프로필',
  '## AI 실행 프로토콜',
  '### Phase 2 — 변경 전 실행 요약',
  '### Phase 4 — 검증과 배포',
  '## 첫 고객 pilot 절차',
  '## AI의 사용자 응답 형식',
]

function missingGuideMarkers(document) {
  return criticalGuideMarkers.filter((marker) => !document.includes(marker))
}

describe('AI-assisted deployment guide contract', () => {
  it('routes deployment requests from every repository entry point', () => {
    expect(fs.existsSync(guidePath)).toBe(true)

    for (const entryPoint of ['README.md', 'AGENTS.md', 'CLAUDE.md']) {
      const text = fs.readFileSync(path.join(root, entryPoint), 'utf8')
      expect(text, entryPoint).toContain('docs/ai-assisted-deployment.ko.md')
    }

    expect(guide).toContain('PostgreSQL')
    expect(guide).toContain('S3 호환 API')
  })

  it('separates implemented contracts, external pilot evidence, and selectable providers', () => {
    expect(guide).toContain('정식 계약')
    expect(guide).toContain('구현 상태')
    expect(guide).toContain('선택 예시')
    expect(guide).toContain('production 완료 조건')
    expect(guide).toContain('호환 모드나 이중 런타임을 만들지 않는다')
    expect(guide).not.toMatch(/\blegacy\b/i)
  })

  it('requires user choice and current official cost verification', () => {
    for (const topic of [
      '정적 public host/CDN',
      'admin runtime',
      'admin identity',
      'PostgreSQL host',
      'S3 호환 object store',
      'comments/contact',
      'provider 외부 backup',
    ]) {
      expect(guide, topic).toContain(topic)
    }

    expect(guide).toContain('공식 가격')
    expect(guide).toContain('결제 활성화')
    expect(guide).toContain('초과 동작')
    expect(guide).toContain('SLA 적용 plan')
    expect(guide).toContain('표준 export')
    expect(guide).toContain('계정·bucket·project 삭제 절차')
  })

  it('fails closed on billing, authority, and secret boundaries', () => {
    expect(guide).toContain('무료 사용량 포함')
    expect(guide).toContain('결제 활성화 불필요')
    expect(guide).toContain('구매, 카드 등록, 사용량 과금')
    expect(guide).toContain('production DNS 변경')
    expect(guide).toContain('기존 데이터 삭제·덮어쓰기')
    expect(guide).toContain('.data/deployment-profile.yaml')

    for (const forbiddenLocation of [
      'shell trace',
      'screenshot',
      'commit',
      'issue',
      'PR',
      'chat',
    ]) {
      expect(guide, forbiddenLocation).toContain(forbiddenLocation)
    }
  })

  it('requires observed deployment, resilience, recovery, and handoff evidence', () => {
    expect(guide).toContain('직접 관찰한다')
    expect(guide).toContain('cross-credential deny')
    expect(guide).toContain('DB/object store 차단 상태의 정적 페이지')
    expect(guide).toContain('direct-origin deny')
    expect(guide).toContain('provider 외부 backup을 빈 DB/bucket에 restore')
    expect(guide).toContain('rollback smoke')
    expect(guide).toContain('실패·미검증·보류 항목과 정확한 다음 행동')
  })

  it('reserves validation for the repository-owner pilot', () => {
    expect(guide).toContain('최초 고객은 이 흐름을 요청한 저장소 소유자')
    expect(guide).toContain('owner-first pilot')
    expect(guide).toContain('`pilot-pending`')
    expect(guide).toContain('`validated`')
    expect(guide).toContain('다른 사용자의 배포를')
  })

  it('detects removal of every critical deployment-guide marker', () => {
    expect(missingGuideMarkers(guide)).toEqual([])

    for (const marker of criticalGuideMarkers) {
      const mutated = guide.split(marker).join('')
      expect(missingGuideMarkers(mutated), marker).toContain(marker)
    }
  })
})
