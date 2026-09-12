---
name: backlog-writer
description: 새 spec 문서를 작성할 때 사용. 모든 필수 섹션이 존재하고 GATE-WRITE 품질 기준을 충족하는 올바른 구조의 spec 문서를 생성한다. 게이트 검증이나 승인 결정은 수행하지 않는다.
---

# Backlog Writer

spec-docs 파일 작성 가이드. 이 스킬은 GATE-WRITE 준비가 된 올바른 구조의 spec 문서 파일을 생성한다. 게이트 실행, 품질 판단, 구현 결정은 하지 않는다.

## Rule Anchor

- `.agents/rules/spec-workflow.md` > HARD GATE: No Immediate Implementation
- `backlog-pipeline` 스킬 > 상태 기계

## 사용 시점

새 spec 문서 생성 시 `backlog-pipeline`이 호출. 직접 사용도 가능.

## 신규 vs 기존 항목

**신규 항목:** 아래 스키마로 `.agents/spec-docs/draft/<ID>.md` 생성.

**기존 항목 (마이그레이션):** 파일이 있지만 구 스키마(frontmatter 없음, `## Test Plan` 없음, `## Evidence Log` 없음)인 경우:

1. 기존 파일 읽기
2. 기존 콘텐츠 추출 후 새 섹션에 매핑
3. 새 스키마로 전체 재작성 (기존 콘텐츠 보존)
4. frontmatter `status: draft` 설정
5. 기존 Acceptance Criteria → `## Completion Criteria`로 매핑, TC-N ID 추가

## ID 생성

`.agents/spec-docs/README.md`의 ID 체계 참조:

- Area prefix 선택 (ADMIN, AUTH, WEB, GROUP, EVENT, POST, TASK, PLACE, SOCIAL, INFRA, CLI)
- 해당 area의 기존 파일 수 확인: `find .agents/spec-docs -name "<AREA>-*.md" | wc -l`
- 다음 순번 사용: `<AREA>-<NNN>` (예: ADMIN-001, ADMIN-002)
- slug는 kebab-case로 기능을 간결하게 설명

## Spec 문서 파일 스키마

`.agents/spec-docs/draft/<ID>.md` 파일을 정확히 이 구조로 생성:

```markdown
---
status: draft
type: <11개 prefix 중 하나 — 아래 분류표 참조>
tags: [<tag>, <tag>]
---

# <ID>: <제목>

## Problem

<!-- 증상 + 재현 조건 -->

## Architecture Review

### Affected Scope

### Alternatives Considered

### Decision

### Architecture Review Checklist

- [ ] 영향 패키지/레이어/파일 목록 작성 완료
- [ ] Sibling scan 완료 — 또는 N/A: <명시적 이유>
- [ ] 대안 최소 2개 검토 완료
- [ ] 결정 근거 문서화 완료

## Solution

## Affected Files

## Completion Criteria

<!-- TC-N prefix 필수 -->

- [ ] TC-01: <기준>
- [ ] TC-02: <기준>

## Test Plan

| TC-ID | Test Type | Tool / Approach | Notes                                    |
| ----- | --------- | --------------- | ---------------------------------------- |
| TC-01 | <type>    | <tool>          | <검증 방식 또는 건너뜀 이유 — 공란 금지> |
| TC-02 | <type>    | <tool>          | <검증 방식 또는 건너뜀 이유 — 공란 금지> |

## Tasks

- [ ] `.agents/tasks/<ID>.md` — 미생성 (GATE-APPROVAL 통과 후 생성)

## Evidence Log
```

---

## `type` 분류표

| Prefix          | 성격                              |
| --------------- | --------------------------------- |
| `SCREEN`        | UI/시각적 출력 (페이지, 컴포넌트) |
| `API`           | HTTP Route, REST 인터페이스       |
| `FLOW`          | 멀티스텝 사용자 인터랙션 시퀀스   |
| `BEHAVIOR`      | 시스템 내부 실행, 상태 전환       |
| `DATA`          | 스키마, 타입 계약, 데이터 모델    |
| `RULE`          | 비즈니스 로직, 유효성 검사, 제약  |
| `AGREEMENT`     | 크로스 시스템 경계 계약           |
| `INFRA`         | 빌드, 배포, CI/CD                 |
| `PERF`          | 성능 계약 (레이턴시, 처리량)      |
| `SECURITY`      | 인증, 위협 경계, 데이터 보호      |
| `OBSERVABILITY` | 로그, 메트릭, 트레이스            |

## `tags` 분류표

환경/플랫폼: `web` · `mobile-web` · `cli`

프로토콜/형식: `rest` · `json-schema` · `typescript`

NFR 횡단 관심사: `i18n` · `a11y` · `async` · `auth`

## Test Strategy 파생표

| Type     | Tags       | 도출된 테스트 전략                     |
| -------- | ---------- | -------------------------------------- |
| SCREEN   | web        | Playwright E2E 또는 브라우저 수동 검증 |
| API      | rest       | HTTP 통합 테스트 또는 curl 검증        |
| FLOW     | web        | Playwright E2E 시나리오                |
| BEHAVIOR | async      | 비동기 상태 단언 통합 테스트           |
| DATA     | typescript | vitest 타입 테스트                     |
| RULE     | (any)      | vitest 단위 테스트                     |
| SECURITY | auth       | 인증 통합 + 권한 경계 테스트           |

## 섹션별 작성 가이드

### `## Problem`

**필수 콘텐츠:**

1. 구체적 증상 — 어떤 명령어, 코드 경로, 또는 출력이 잘못됨
2. 재현 조건 — 언제, 어디서 발생

**거부 조건 (GATE-WRITE 실패):** "TBD", 모호한 단일 문장, "제대로 동작 안 함"

### `## Architecture Review`

- **Affected Scope:** 변경되는 모든 패키지, 레이어, 파일 나열
- **Alternatives Considered:** 최소 2개. 각각 한 줄 설명 + Pro + Con
- **Decision:** 선택한 대안과 이유. 트레이드오프 참조.
- **Architecture Review Checklist:** 4개 항목 모두 `[x]` 필요
- **충돌 점검(Sibling scan의 일부):** 신규 라우트/경로/공개 식별자가 **기존 것을 가리거나 충돌하지 않는지** 확인한다. 충돌 위험이 있으면 구별되는 세그먼트/프리픽스를 택하고(별도 경로 네임스페이스 등) 그 결정을 Decision에 기록. 기존 것을 무효화·차단하는 변경은 영향 범위를 명시.

### `## Completion Criteria`

**규칙:**

- 모든 항목에 `TC-N` prefix 필수 (TC-01, TC-02, …)
- 구현 시작 전에 작성
- 각 기능/하위 항목마다 최소 1개 기준
- Command form: `TC-01: <명령어> → exit <코드> / 출력 <문자열>`
- Observable behavior form: 정확한 문자열, 특정 관찰 가능 출력

**거부 조건:** TC-N 없는 항목, "올바르게 동작", "에러 없음", "구현됨"

### `## Test Plan`

**규칙:**

- Completion Criteria의 TC-N마다 1행
- **모든 행의 Notes를 작성 시점에 채운다** — 테스트 전략, 검증 방식, 또는 건너뜀 이유. 공란 행은 GATE-WRITE에서 FAIL (GATE-COMPLETE와 동일 기준)
- 자동화 테스트 불가 시: Notes에 이유 기록, Tool에 "manual" 표시
- **검증 전제(precondition)를 Notes에 명시한다** — 동작 검증은 대표성 있는 데이터/상태가 갖춰져야 의미가 있다. 데이터 의존(목록·피드) TC는 신선한 시드, 인증·권한·멤버십 의존 TC는 필요한 계정/역할/상태를 전제로 적는다. **빈/낡은 데이터나 권한 미충족을 "기능 미동작"으로 오판하지 않도록**, "0건이면 빈 상태"·"승인된 멤버 전제" 같은 구분을 TC 또는 Notes에 둔다.

**publisher 테스트 명령어:**

```bash
pnpm --filter @publisher/site test          # site tests
pnpm --filter @publisher/site build         # static export build
```

### `## Tasks`

초안 시 플레이스홀더 유지. GATE-IMPLEMENT에서 `backlog-gate-guard`가 채움.

### `## Evidence Log`

초안 시 비워둠. 모든 항목은 `backlog-gate-guard`가 기록. 직접 작성 금지.

## 이 스킬이 하지 않는 것

- 게이트 실행 또는 PASS/FAIL 결정 → `backlog-gate-guard`
- frontmatter status 업데이트 → `backlog-pipeline`
- Evidence Log 항목 작성 → `backlog-gate-guard`
- 어떤 테스트 타입을 사용할지 파생표 외의 결정
