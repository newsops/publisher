---
name: post-implementation-checklist
description: 구현 완료 후 필수 체크리스트 — spec 검증, build/test, 브라우저 시각 검증, 커밋/푸시. 코드 변경을 끝낸 뒤 사용자 요청 없이 자동 실행한다.
---

# Post-Implementation Checklist

코드를 변경한 모든 작업은 "완료" 선언 전에 이 체크리스트를 **자동으로** 실행한다(사용자 요청 대기 금지). 라이브러리 publish 단계는 없음(mogak은 앱 — Vercel/EAS 배포).

## 사용 시점

- 기능·리팩터·버그픽스로 코드를 바꾼 후 / 새 라우트·컴포넌트·서비스 추가 후.

## 체크리스트 (순서대로)

### 0. Spec 갱신 (검증 전 필수)

- [ ] 관련 spec-docs(`active/<ID>.md`)의 Completion Criteria(TC)·Evidence를 실제 코드 동작으로 갱신. 스펙은 "의도된 최종 상태"를 사실로 기술.
- [ ] 새 타입/동작 추가 시 스펙에 반영, 기존 동작 변경 시 스펙 일치.
- **GATE**: 스펙 갱신 전 Step 1로 진행 금지.

### 1. Build & Test

- [ ] `pnpm --filter @publisher/site build` (또는 변경 앱) — 성공.
- [ ] `pnpm -r test` — 통과. `pnpm -r lint` — 통과.
- [ ] stale 참조 0(삭제 파일·이름 변경 타입·제거된 export).
- [ ] **회귀 수정이면 회귀 테스트 추가**(`.agents/rules/regression-tests.md`): 사용자 대면 회귀를 고쳤다면 그 부류를 잡는 테스트(불변식·기하·단위)를 함께 추가하고, 옛 버그 값으로 되돌리면 RED가 되는지(센티넬) 확인.
- [ ] **환경 의존값 토큰화**(`.agents/rules/env-values-no-hardcode.md`): 인셋·크기 등 환경별 값은 인라인 매직넘버 대신 OS 실측 + 디자인 토큰 + 불변식 테스트.

#### 1a. 위임된 "green" 주장 독립 재검증

서브에이전트에 위임했다면 "all green" 보고를 액면 신뢰하지 말고 오케스트레이터가 자기 컨텍스트에서 핵심 게이트(build·test·관련 가드)를 직접 재실행해 재현 확인.

### 2. 실행·시각 검증 (사용자 대면 변경 시 필수)

- [ ] **에이전트 자체 검증 우선**(`.agents/rules/self-verify-first.md`): 사용자에게 수동 확인을 요청하기 전에 가용 도구(에뮬레이터/시뮬레이터/브라우저/실기기)로 **에이전트가 먼저 직접** 대상 동작을 실행·관찰해 통과시킨다. 통과 후에만 사용자에게 동일 검증을 요청한다.
- [ ] `.agents/rules/browser-verification.md` 절차대로 Chrome DevTools/에뮬레이터로 실제 동작 확인(로그인 흐름 포함). **step 0: dev db 확인.**
- [ ] 모바일·데스크탑 두 뷰포트, 라이트·다크 모드(테마 변경 시).
- [ ] 시드 데이터 정리(step 9), 스크린샷/스냅샷 증거.
- 데이터 검증이면 `scripts/lib/db-guard.mjs` 격리 보장(prod 미접촉).

### 3. 커밋 & 푸시

- [ ] spec + 코드 변경 커밋. **커밋 후 `git status`로 부분 스테이징 누락 확인**(흔한 실수 #17).
- [ ] **커밋 제목 commitlint 형식** — 첫 글자를 대문자/PascalCase·식별자(`WEB-01`, `Discover` 등)로 시작 금지. 한국어 또는 소문자로 시작하고 작업 ID는 **끝 괄호**로(`feat: <한국어 요약> (ID)`). 위반 시 `commit-msg` 훅 거부 → 재커밋 왕복 발생.
- [ ] 푸시 → `.husky/pre-push`가 lint→build→test→audit→scan 게이트 실행(통과해야 완료).

### 4. PR & 완료

- [ ] 브랜치→PR. 머지는 모든 required check green 후(외부 서비스 실패도 원인 추적·수정 책임은 에이전트 — 흔한 실수 #10).
- [ ] 완료 시 spec done/ 아카이브, task completed/ 이관.

## 축약형 (작은 변경)

Spec 확인 → build+test → (대면이면)브라우저 검증 → 커밋·푸시 → PR.

## 규칙

- Spec 검증·브라우저 검증을 절대 건너뛰지 않는다.
- build+test 미통과 상태로 완료 선언 금지(CI red is not done — 흔한 실수 #10).
- 데이터 변경 검증은 dev db 격리 확인 후에만.
