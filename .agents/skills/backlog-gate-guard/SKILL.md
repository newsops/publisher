---
name: backlog-gate-guard
description: spec-docs의 단일 게이트를 검증하고 Evidence Log에 결과를 기록. backlog-pipeline이 서브에이전트로 호출. 정확히 하나의 게이트만 확인하고 PASS/FAIL/NON-COMPLIANCE를 반환한다.
---

# Backlog Gate Guard

spec-docs 단일 게이트 검증기. 하나의 게이트를 확인하고 Evidence Log에 결과를 추가한 후 PASS, FAIL, 또는 NON-COMPLIANCE를 반환한다. 콘텐츠 작성, 파이프라인 오케스트레이션, 구현은 하지 않는다.

## Rule Anchor

- `.agents/rules/spec-workflow.md` > HARD GATE: No Immediate Implementation
- `backlog-pipeline` 스킬 > 상태 기계

## 사용 시점

`backlog-pipeline`이 **서브에이전트**로 호출 (Agent 도구). 각 호출은 정확히 하나의 게이트를 처리.

**호출자로부터 필요한 입력:**

- 게이트 이름: `GATE-WRITE`, `GATE-APPROVAL`, `GATE-IMPLEMENT`, `GATE-VERIFY`, `GATE-COMPLETE` 중 하나
- Spec 문서 경로: `.agents/spec-docs/<stage>/<ID>.md`

## 출력

항상 Edit 도구로 spec 문서의 `## Evidence Log` 섹션에 하나 이상의 항목을 추가한다. 그런 다음 다음 중 하나를 반환:

- `PASS` — 모든 기준 충족, status 업그레이드 승인
- `FAIL` — 하나 이상의 기준 미충족, status 업그레이드 차단
- `NON-COMPLIANCE` — 게이트 우회 또는 이전 게이트 증거 누락

## Evidence Log 항목 형식

모든 항목은 반드시 이 형식을 사용:

```markdown
### [<GATE-NAME>] — ✅ PASS | <YYYY-MM-DD>

**Status upgrade:** <현재> → <다음>
<확인된 각 기준에 대한 구체적 증거. 기준마다 한 줄.>

### [<GATE-NAME>] — ❌ FAIL | <YYYY-MM-DD>

**Status remains:** <현재>
**Failed criteria:**

- <기준>: <발견된 것 vs 필요한 것>
  **Required action:** <이 게이트 재실행 전에 수정해야 할 것>

### [<GATE-NAME>] — 🔴 NON-COMPLIANCE | <YYYY-MM-DD>

**Status remains:** <현재>
**Violation:** <우회되거나 건너뛴 것>
**Required action:** <해결하기 위해 해야 할 것>
```

### 운영 인스턴스 증거 (Operated-instance evidence)

모든 게이트에 적용된다 (`.agents/rules/repository-scope.md`). 이 저장소는
프로그램만 담으므로, 운영 중인 사이트에서 확인한 결과는 Evidence Log에
**"verified on an operated instance; evidence kept privately by the operator"**
문구로만 기록한다. 실제 URL·명령 출력·ID·스크린샷은 운영자의 비공개 노트에
남기고 spec에 옮기지 않는다.

- 프로그램 검증 증거(체크인된 fixture, 로컬 미러, 플레이스홀더 신원에 대한
  명령과 결과)는 평소처럼 구체적으로 기록한다.
- 검증 대상 spec의 Evidence Log에 운영 사이트의 **도메인·호스트,
  배포/운영/릴리스 ID, 프로덕션 스크린샷 경로**가 들어 있으면 해당 게이트는
  **FAIL**이다. Required action은 그 항목을 위 문구로 바꾸는 것이다.

---

## 게이트 기준

### GATE-WRITE `draft → review-ready`

모든 항목 확인. 단 하나라도 미충족 = FAIL.

**Frontmatter:**

- [ ] 파일이 `---` YAML frontmatter 블록으로 시작
- [ ] `status: draft` 존재
- [ ] `type:`이 11개 prefix 중 정확히 하나: SCREEN · API · FLOW · BEHAVIOR · DATA · RULE · AGREEMENT · INFRA · PERF · SECURITY · OBSERVABILITY
- [ ] `tags:` 필드 존재 (빈 배열 `[]` 허용)
- [ ] `authority:`가 `delegated` 또는 `confirmation-required` 중 하나

**Problem 섹션:**

- [ ] 구체적 증상 포함 (특정 명령어, 출력, 또는 잘못된 동작)
- [ ] 재현 조건 포함 (언제/어디서 발생)
- [ ] "TBD", "TODO", 모호한 단일 문장 없음

**Architecture Review Checklist:**

- [ ] 4개 체크리스트 항목 모두 `[x]`
- [ ] Sibling scan 항목이 완료 증거 또는 명시적 `N/A: <이유>`와 함께 `[x]`
- [ ] Alternatives Considered에 각각 pro/con이 있는 최소 2개 항목
- [ ] Decision이 선택을 이끈 트레이드오프를 참조

**Completion Criteria:**

- [ ] 모든 항목에 `TC-N` prefix (TC-01, TC-02, …) — 없으면 FAIL
- [ ] 각 기능/하위 항목마다 최소 1개 기준
- [ ] 각 기준이 Command form 또는 Observable behavior form 사용
- [ ] "올바르게 동작", "에러 없음", "구현됨", "올바르게 표시됨" 사용 없음

**Test Plan 섹션:**

- [ ] `## Test Plan` 섹션 존재
- [ ] Completion Criteria의 TC-N마다 1행 (수 일치)
- [ ] 각 행의 Test Type과 Tool/Approach가 비어있지 않음 ("TBD" 없음)
- [ ] **모든 행**의 Notes가 비어있지 않음 — 테스트 전략, 검증 방식, 또는 건너뜀 이유 기재 (GATE-COMPLETE의 "모든 TC-N 행에 테스트 참조 또는 건너뜀 이유" 기준과 동일 범위)
- [ ] Tool이 "manual"인 행의 Notes에는 자동화 테스트가 불가능한 이유가 반드시 포함됨

**구조:**

- [ ] Tasks 섹션 플레이스홀더 존재
- [ ] Evidence Log 섹션 존재하고 비어있음 (첫 GATE-WRITE 실행)

**PASS 시 기록할 증거:** 확인된 각 섹션과 결과 명시. TC-N 수가 Completion Criteria와 Test Plan 간 일치하는지 확인.

---

### GATE-APPROVAL `review-ready → approved`

- [ ] `authority: delegated`이면 `.agents/rules/authority-delegation.md`의
      standing delegation과 완성된 Architecture Review를 확인한다. 이 경우
      현재 turn의 항목별 재승인은 요구하지 않는다.
- [ ] `authority: confirmation-required`이면 사용자가 현재 대화에서 이 spec에
      직접·명시적으로, Architecture Review 이후 승인했다.
- [ ] 승인/위임 근거 뒤 Architecture Review 또는 frontmatter type/tags/authority
      수정 없음

**실행 시점 예외:** delegated spec도 비용·결제, production DNS, 기존
production 데이터 삭제/덮어쓰기, 외부 메시지, 계정 생성/폐쇄, 비밀 공개, 새
외부 runtime/proxy/queue/cache/managed service의 최종 실행을 승인하지 않는다.
그 행동 바로 전에 좁은 범위의 확인을 받는다. 이 예외는 구현 코드를 작성하는
GATE-APPROVAL의 재승인 사유가 아니다.

**명시적 승인으로 인정되는 것:**

- "승인", "진행해", "맞아 진행해", "ok 시작해", "끝까지 책임지고 작업해"
- 설계를 명확히 확인하고 구현을 승인하는 모든 진술

**위임 승인으로 인정되는 것:**

- frontmatter `authority: delegated`와 완료된 Architecture Review가 있고,
  `.agents/rules/authority-delegation.md`가 standing delegation을 선언한다.
- Evidence에는 delegated authority와 문서 경로를 명시하고, 실제 실행 시점
  예외가 여전히 적용됨을 기록한다.

**인정되지 않는 것:**

- 설계 확인 없이 질문에 답하는 것 ("ㅇㅇ", "응")
- 침묵 또는 이의 없음
- 같은 대화의 다른 항목에 대한 승인

**PASS 시 기록할 증거:** confirmation-required면 정확한 사용자 진술을 verbatim
으로 인용하고 날짜 기록. delegated면 authority field, rule 경로, Architecture
Review 완료, 그리고 실행 시점 예외 유지 사실을 기록.

**NON-COMPLIANCE 트리거:** 이 게이트 실행 전에 구현 작업 (파일 편집, 코드 커밋) 시작.

---

### GATE-IMPLEMENT `approved → in-progress`

- [ ] `.agents/tasks/<ID>.md` 파일이 생성됨
- [ ] Tasks 파일 경로가 spec 문서의 `## Tasks` 섹션에 기록됨
- [ ] Tasks 파일의 태스크가 Completion Criteria에 해당 (TC-N마다 최소 1개 태스크)

**PASS 시 기록할 증거:** Tasks 파일 경로 + 생성된 태스크 목록.

**NON-COMPLIANCE 트리거:** 구현 커밋이 존재하지만 tasks 파일이 없음.

---

### GATE-VERIFY `in-progress → verifying`

- [ ] `.agents/tasks/<ID>.md`의 모든 태스크가 완료 표시 (`[x]`)
- [ ] 차단되거나 보류 중인 태스크 없음
- [ ] 영향받는 패키지 빌드 통과:
  ```bash
  pnpm --filter @publisher/site build
  ```
- [ ] 영향받는 패키지 테스트 통과:
  ```bash
  pnpm --filter @publisher/site test
  ```
- [ ] `type`이 SCREEN/FLOW/BEHAVIOR/API이고 사용자 대면 동작이 변경된 spec인 경우: **브라우저 검증 Evidence**(사용한 테스트 계정 라벨 + 뷰포트 명시)가 spec 또는 tasks 파일에 존재 (`.agents/rules/browser-verification.md` 준수). 로그인 필요 흐름을 `.agents/test-accounts.json` 계정 확인 없이 manual-only로 처리했다면 **FAIL**.
- [ ] **에이전트 자체 검증 우선**(`.agents/rules/self-verify-first.md`): 사용자 대면 동작 변경의 Evidence가 "사용자에게 확인 요청"만 있고 **에이전트가 가용 도구(에뮬레이터/시뮬레이터/브라우저/실기기)로 먼저 직접 검증한 기록이 없으면 FAIL**. 자체 검증을 건너뛴 경우 자동화 불가 사유가 명시돼야 한다.
- [ ] **대칭 원칙 + 블로커=해결 과제**(`.agents/rules/self-verify-first.md`): 사용자에게 떠넘긴 검증을 에이전트가 동일 방법으로 완주하지 않았으면 **FAIL**. 그리고 건너뜀 사유가 **설치 가능한 도구**(예: `idb`)·**대체 표면 전환**(iOS 시뮬→Android 에뮬+adb)·**dev 테스트 계정 가입/로그인**으로 해결 가능한 것이면 "자동화 불가"로 인정하지 않고 **FAIL**(본질적 불가만 인정).

**PASS 시 기록할 증거:** tasks 파일 완료 상태 확인 + 실행된 빌드/테스트 명령어와 결과 + (사용자 대면 변경 시) 에이전트 자체 검증 Evidence 위치.

**FAIL 트리거:** 미완료 태스크, 빌드 실패, 테스트 실패, 사용자 대면 변경의 브라우저 검증 Evidence 부재.

---

### GATE-COMPLETE `verifying → done`

Completion Criteria의 각 TC-N에 대해:

- [ ] 체크박스가 체크됨 (`[x]`)
- [ ] `[GATE-COMPLETE: TC-N]` Evidence Log 항목이 다음과 함께 존재:
  - 검증에 사용된 정확한 명령어 또는 액션
  - 관찰된 실제 출력 또는 결과

Test Plan의 각 TC-N에 대해:

- [ ] **다음 중 하나 기록됨:**
  - **테스트 작성됨:** 테스트 파일 경로 + 테스트 함수/describe 이름
  - **테스트 건너뜀:** 자동화 테스트를 작성하지 않은 명시적 이유
- [ ] 모든 TC-N 행에 테스트 참조 또는 건너뜀 이유가 있음 — 어떤 행도 silent하게 미처리되지 않음

모든 기준 후:

- [ ] spec 문서의 `## Completion Criteria` 체크박스가 모두 `[x]`
- [ ] `## Test Plan`이 모든 TC-N 행에 대한 테스트 참조 또는 건너뜀 이유로 업데이트됨
- [ ] Tasks 파일이 `.agents/tasks/completed/<ID>.md`로 아카이브됨
- [ ] `## Tasks` 섹션이 아카이브된 경로를 반영하도록 업데이트됨

**PASS 시 기록할 증거:** TC-N마다 하나의 Evidence 항목 (검증 + 테스트 참조/건너뜀), 그런 다음 최종 요약 항목.

**FAIL 트리거:** 미체크된 TC-N, 또는 매칭 Evidence 항목 없이 체크된 TC-N. Test Plan에서 테스트 참조와 건너뜀 이유 모두 없는 TC-N. 운영 사이트의 도메인·호스트, 배포/운영/릴리스 ID, 프로덕션 스크린샷 경로가 들어 있는 Evidence 항목 (위 "운영 인스턴스 증거").

---

## Anti-Patterns

| 안티패턴                                       | 올바른 동작                                   |
| ---------------------------------------------- | --------------------------------------------- |
| 구체적 증거 없이 기준 확인                     | 항상 무엇을 확인했고 무엇을 발견했는지 기록   |
| 하나의 기준 미충족인데 PASS 작성               | 특정 실패 기준과 함께 FAIL 작성               |
| "해당없어 보여서" 기준 건너뜀                  | Evidence 항목에 N/A인 이유 명시적으로 문서화  |
| guard 실행 중 Problem이나 Solution 섹션 편집   | Evidence Log, Test Plan, Tasks 제외 읽기 전용 |
| 여러 게이트의 PASS 증거를 한 항목에 합침       | 게이트당 하나의 항목, 명확히 라벨             |
| 테스트 참조나 건너뜀 이유 없이 TC-N 완료 표시  | 완료 표시 전 참조 또는 건너뜀 이유 작성       |
| frontmatter 대신 `## Status` 섹션 확인         | 항상 frontmatter `status:` 필드 읽기          |
| 하나의 호출에서 여러 게이트 실행               | 서브에이전트 호출당 정확히 하나의 게이트      |
| 운영 사이트 URL·배포 ID·스크린샷을 증거로 기록 | "verified on an operated instance; …" 문구만  |
