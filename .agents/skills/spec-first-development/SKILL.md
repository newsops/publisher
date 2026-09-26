---
name: spec-first-development
description: 기능 추가, 동작 변경, API Route 추가/수정, 패키지 공개 API 변경 등 구현 전에 사용. 코드 작성 전 스펙이 먼저 업데이트되고 검증 테스트 계획이 존재하는지 확인.
---

## Rule Anchor

- `.agents/rules/spec-workflow.md` — "Spec-First Development"
- `.agents/rules/spec-workflow.md` — "Live Spec Policy"

## 사용 시점

아래 중 **하나라도** 해당하면 이 스킬을 트리거합니다:

- 새 기능 또는 동작을 추가할 때
- 기존 동작, 의미, 설정을 변경할 때
- 새 페이지 또는 UI 컴포넌트를 추가할 때
- API Route를 추가하거나 요청/응답 스키마를 변경할 때
- 콘텐츠 저장소 스키마나 발행 계약을 변경할 때
- 패키지 공개 export(클래스, 함수, 타입, 상수)를 추가하거나 제거할 때
- 에러 타입이나 에러 코드를 추가하거나 변경할 때
- 기능을 제거하거나 export를 deprecated 처리할 때

관찰 가능한 동작 차이 없이 내부 구현 세부 사항만 변경하는 경우 스펙 업데이트가 필요하지 않습니다. 단, 의심스러우면 업데이트합니다.

## Workflow

### Step 1: 영향받는 스펙 문서 식별

변경된 동작을 소유하는 스펙을 찾습니다:

- 새 기능 / UI / API Route → `specs/<feature>.md` (없으면 `_template.md`를 복사하여 생성)
- 패키지 공개 API 변경 → `packages/<name>/docs/SPEC.md`
- 여러 패키지에 걸친 변경 → 두 스펙 모두 업데이트

해당 패키지에 스펙이 없으면 [`spec-writing-standard`](../spec-writing-standard/SKILL.md) Mode A(초기 생성)를 사용하여 먼저 생성합니다.

### Step 2: 변경될 스펙 섹션 결정

[`spec-writing-standard`](../spec-writing-standard/SKILL.md) Mode B(점진적 업데이트, Step 1)의 조회 테이블을 사용하여 업데이트해야 할 섹션을 나열합니다. 코드에 손대기 전에 목록을 작성합니다.

### Step 3: 스펙을 점진적으로 업데이트

[`spec-writing-standard`](../spec-writing-standard/SKILL.md) Mode B(점진적 업데이트)를 사용하여 대상 스펙 업데이트를 적용합니다. Step 2에서 식별한 섹션만 변경합니다.

스펙 업데이트는 구현 코드보다 **먼저** 또는 **동일한 커밋에** 커밋되어야 합니다. PR 이후로 미루지 않습니다.

### Step 4: 검증 테스트 계획 정의

업데이트된 각 스펙 섹션에 대해 다음을 명시합니다:

- **무엇을 검증할지**: 어떤 계약 단언이 변경을 검증하는지
- **어떻게 검증할지**: 단위/통합/계약 테스트 또는 브라우저/curl 검증
- **실행 명령어**: 정확한 검증 명령어

### Step 5: 스펙에 따라 구현

- 업데이트된 스펙을 따르는 코드를 작성합니다 — 스펙이 이제 설계 아티팩트입니다
- TDD 사이클을 따릅니다 (red → green → refactor)
- 빌드 및 검증: `pnpm run build`

### Step 6: 준수 검증

구현 후 전체 준수 검증 루프를 실행합니다:

- [`spec-code-conformance`](../spec-code-conformance/SKILL.md) 참조
- 격차가 0이고 회귀 테스트가 통과해야 구현이 완료됩니다

## 오케스트레이션되는 스킬

| 스킬                    | 역할                                   |
| ----------------------- | -------------------------------------- |
| `spec-writing-standard` | SPEC.md 점진적 업데이트 및 품질 게이트 |
| `spec-code-conformance` | 구현 후 준수 검증                      |
| `api-spec-management`   | API Route 스펙 업데이트                |
