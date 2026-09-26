---
name: backlog-pipeline
description: 새 기능·수정·개선 발견 시 ALWAYS 먼저 실행. spec-docs 게이트 파이프라인 오케스트레이터. 현재 상태를 읽고 다음 게이트를 결정하며 backlog-writer 또는 backlog-gate-guard를 호출한다. 코드 작성 전 반드시 이 스킬로 GATE-APPROVAL을 통과해야 한다.
---

# Backlog Pipeline

spec-docs 게이트 파이프라인의 상태 기계 오케스트레이터. 이 스킬은 파이프라인 흐름만 관리하며 콘텐츠 작성, 품질 판단, 구현 수행은 하지 않는다.

## Rule Anchor

- `.agents/rules/spec-workflow.md` > HARD GATE: No Immediate Implementation
- `.agents/spec-docs/README.md` > 라이프사이클

## 사용 시점

아래 상황에서 **ALWAYS** 이 스킬을 먼저 실행:

- 새 기능·페이지·API Route를 추가할 때
- 기존 동작·UI를 변경할 때
- 버그 수정 (단, 명백한 오타 수정 제외)
- 개발 중 갭·개선 발견 시
- 기존 spec-docs 항목을 재개할 때

## STOP 조건 (비협상)

게이트 전환 전 반드시 확인:

1. spec-docs 파일 위치가 확인됨
2. `status:` frontmatter 필드가 상태 표에 있는 값과 일치
3. 이전 게이트의 Evidence Log 항목이 존재 (PASS, FAIL, 또는 NON-COMPLIANCE)

미충족 시: **STOP. 진행하지 않는다. NON-COMPLIANCE 항목을 기록하고 사용자에게 알린다.**

## 파일 위치 프로토콜

spec-docs 파일은 `.agents/spec-docs/<stage>/` 에 위치한다. ID만 주어진 경우:

```bash
find .agents/spec-docs -name "<ID>*.md" -not -path "*/rejected/*"
```

- 결과 1개 → 해당 경로 사용
- 결과 0개 → STOP: 파일 없음, 사용자에게 알림
- 결과 2개+ → STOP: 모호한 ID, 찾은 경로 모두 표시

## 상태 기계

| 현재 `status`  | 폴더        | 다음 액션                                         | PASS 후 다음 status | PASS 후 폴더 이동       |
| -------------- | ----------- | ------------------------------------------------- | ------------------- | ----------------------- |
| (미생성)       | —           | `backlog-writer` 스킬 호출                        | `draft`             | → `draft/`              |
| `draft`        | `draft/`    | `backlog-gate-guard` 서브에이전트: GATE-WRITE     | `review-ready`      | `draft/` → `backlog/`   |
| `review-ready` | `backlog/`  | `backlog-gate-guard` 서브에이전트: GATE-APPROVAL  | `approved`          | `backlog/` → `todo/`    |
| `approved`     | `todo/`     | `backlog-gate-guard` 서브에이전트: GATE-IMPLEMENT | `in-progress`       | `todo/` → `active/`     |
| `in-progress`  | `active/`   | `backlog-gate-guard` 서브에이전트: GATE-VERIFY    | `verifying`         | **없음 — active/ 유지** |
| `verifying`    | `active/`   | `backlog-gate-guard` 서브에이전트: GATE-COMPLETE  | `done`              | `active/` → `done/`     |
| `done`         | `done/`     | 액션 없음. 파이프라인 완료.                       | —                   | —                       |
| `rejected`     | `rejected/` | 액션 없음. 항목 닫힘.                             | —                   | —                       |

## 실행 단계

### Step 1 — 현재 상태 읽기

```
1. spec-docs 파일 위치 확인 (파일 위치 프로토콜 참조)
2. frontmatter `status:` 필드 읽기
3. 상태 표에서 매칭
4. 이전 게이트의 마지막 Evidence Log 항목 존재 확인
```

### Step 2 — 적절한 컴포넌트 호출

**status가 미생성인 경우:**

- `backlog-writer` 스킬 호출 (Skill 도구)
- writer 완료 후 `.agents/spec-docs/draft/<ID>.md` 파일 생성
- ID는 `.agents/spec-docs/README.md`의 ID 체계를 따름

**status가 `draft` ~ `verifying`인 경우:**

`backlog-gate-guard`를 **서브에이전트**로 호출 (Agent 도구):

```
당신은 backlog-gate-guard 서브에이전트입니다. 하나의 게이트만 검증합니다.

게이트: <GATE>          (예: GATE-WRITE)
스펙 문서: <PATH>       (예: ADMIN-001-admin-dashboard)

지시사항:
1. backlog-gate-guard 스킬 읽기: .agents/skills/backlog-gate-guard/SKILL.md
2. <PATH>의 스펙 문서 읽기
3. 스킬에 명시된 <GATE>의 모든 기준 확인
4. Edit 도구로 ## Evidence Log 섹션에 결과 항목 추가
5. 정확히 다음 중 하나 반환: PASS | FAIL | NON-COMPLIANCE
   그 뒤에 한 줄 이유
```

서브에이전트 결과 대기: PASS | FAIL | NON-COMPLIANCE

### Step 3 — 게이트 결과 처리

**PASS (폴더 이동이 필요한 경우 — GATE-VERIFY 제외):**

1. `git mv <현재경로> .agents/spec-docs/<다음단계>/<파일명>` 실행
2. 이동된 파일의 frontmatter `status:` 필드를 다음 상태 값으로 즉시 업데이트
3. 두 단계는 원자적. 둘 다 완료 전에는 성공으로 보고하지 않음.
4. 사용자에게 확인: "게이트 X 통과. 상태: `<다음상태>`. `<다음단계>/`로 이동됨."

`GATE-APPROVAL`은 `.agents/rules/authority-delegation.md`를 따른다.
`authority: delegated`와 완성된 Architecture Review는 standing delegation으로
충분하며 항목별 재승인을 요청하지 않는다. `confirmation-required` 또는 실제
외부 실행 예외만 사용자 확인을 요구한다.

**PASS (GATE-VERIFY — 폴더 이동 없음):**

1. 파일에서 frontmatter `status: verifying` 업데이트 (active/ 유지)
2. 사용자에게 확인: "GATE-VERIFY 통과. 상태: `verifying`. active/에 유지."
3. **GATE-COMPLETE 호출 전 완료 부기 정리(오케스트레이터 책임)**: GATE-COMPLETE는 spec의 `## Completion Criteria` 체크박스가 모두 `[x]`이고 tasks 파일의 게이트/PR 항목이 정리돼 있을 것을 요구한다. 검증 결과를 반영해 이 체크박스들을 먼저 `[x]`로 정리한 뒤 GATE-COMPLETE를 호출하면, 순수 부기 누락으로 인한 보완형 FAIL 왕복을 예방한다.

**FAIL:**

- frontmatter status 업데이트 또는 파일 이동 금지
- 기본 동작: 실패 기준을 사용자에게 알림 → STOP. 수정 또는 구현 시도 금지. 사용자 지시 대기.
- **보완형 FAIL 예외 (자율 실행)**: 아래 두 조건을 모두 충족하면 수정 후 게이트를 재실행할 수 있다:
  1. 사용자가 현재 대화에서 파이프라인 완주를 명시적으로 사전 승인함 (GATE-APPROVAL Evidence Log에 verbatim 인용 존재)
  2. 실패 원인이 **스펙 의도를 변경하지 않는 보완형**임 — 문서 형식 보정, 누락된 기입(예: Test Plan Notes 공란) 등. Completion Criteria 미충족·구현 결함·설계 변경이 필요한 FAIL은 해당 없음 → 기본 동작(STOP)
  - 예외 적용 시 의무: FAIL 발생과 보완 조치가 Evidence Log에 남아야 하며(guard의 FAIL 항목 + 재실행 항목), 사용자 최종 보고에 FAIL→보완→재실행 경과를 반드시 포함한다.

**NON-COMPLIANCE:**

- frontmatter status 업데이트 또는 파일 이동 금지
- Evidence Log에 NON-COMPLIANCE 항목 기록 (guard가 이미 안 했다면)
- STOP 즉시. 위반된 게이트와 누락된 증거를 알림.
- 위반이 해결될 때까지 진행 금지.

## 거부(Rejection) 액션

파일을 `rejected/`로 이동하는 경우:

1. 사용자가 명시적으로 항목 취소 ("취소", "거부", "reject"), 또는
2. NON-COMPLIANCE 위반이 해결 불가능한 것으로 판단

거부 단계:

1. `git mv <현재경로> .agents/spec-docs/rejected/<파일명>`
2. 이동된 파일의 frontmatter `status: rejected` 업데이트
3. Evidence Log에 `[REJECTION]` 항목 추가 (이유와 날짜)
4. 이 항목에 대한 파이프라인 중지

주의: GATE FAIL은 거부가 아님. FAIL은 수정 후 재실행 가능. 거부는 항목을 영구적으로 닫는 의도적 결정.

## 스코프 변경(Re-scope) 처리

이미 게이트를 통과한(approved/in-progress 등) 항목의 **전제·범위가 사용자 지시로 실질적으로 바뀌면**, 승인된 스펙을 조용히 덮어쓰지 않는다. 이전 게이트(WRITE/APPROVAL)는 옛 내용을 검증한 것이므로 무효다.

1. 스펙 파일을 `draft/`로 되돌리고 frontmatter `status: draft`로 리셋. 슬러그가 더 이상 내용과 맞지 않으면 **파일명(슬러그)도 새 범위에 맞게 변경**한다.
2. 이전 게이트 Evidence는 새 범위에 무효이므로, 새 내용 기준으로 **GATE-WRITE → GATE-APPROVAL을 다시 거친다**(사용자의 재정의 지시를 GATE-APPROVAL verbatim으로 인용).
3. 이미 생성된 tasks 파일이 있으면 GATE-IMPLEMENT에서 새로 작성되도록 제거/리셋.
4. **작업 브랜치명도 새 범위에 맞춘다**(`git branch -m`). 브랜치명이 의도한 PR head와 다르면 push/PR 생성이 실패한다 — 슬러그·브랜치·PR head를 일관되게 유지.

원래 항목을 폐기하고 새 항목으로 가는 게 더 깔끔하면 옛 항목은 거부(`rejected/`), 새 항목을 신규 ID로 작성한다.

## Anti-Patterns

| 안티패턴                                                 | 올바른 동작                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Evidence Log 항목 없이 다음 게이트로 이동                | STOP. NON-COMPLIANCE 기록.                                                                                          |
| `delegated` spec에 항목별 재승인을 반복 요구             | STOP. standing delegation을 Evidence에 기록해 승인 처리; 실행 시점 예외만 재확인.                                   |
| guard를 서브에이전트 대신 인라인으로 실행                | 항상 Agent 서브에이전트로 생성.                                                                                     |
| 실질적 FAIL(기준 미충족·구현 결함)을 수정 후 즉시 재실행 | 사용자에게 실패 알림 후 지시 대기. 보완형 FAIL은 완주 사전 승인 + Evidence 기록 + 최종 보고 조건에서만 재실행 가능. |
| GATE-COMPLETE 전 status를 done으로 설정                  | status 변경은 게이트 PASS 결과만 따름.                                                                              |
| `git mv` 후 frontmatter 업데이트 잊음                    | 두 단계 모두 즉시 완료.                                                                                             |
| GATE-VERIFY PASS에서 파일 이동                           | GATE-VERIFY는 파일 이동 없음. frontmatter만 업데이트.                                                               |
