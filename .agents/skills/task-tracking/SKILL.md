---
name: task-tracking
description: Use when starting, progressing, or completing a task to maintain a persistent record of work in .agents/tasks/.
---

# Task Tracking

## 사용 시점

- 여러 단계가 포함된 새 태스크 또는 기능 시작
- 이전 세션에서 작업 재개
- 태스크 완료 및 아카이브

## 디렉토리 구조

```
.agents/tasks/
├── <task-name>.md          # 활성 태스크
└── completed/
    └── <task-name>.md      # 완료/아카이브된 태스크
```

## 태스크 파일 형식

```markdown
# <태스크 제목>

- **Status**: todo | in-progress | blocked | completed
- **Created**: YYYY-MM-DD
- **Branch**: feat/xxx (해당 시)
- **Scope**: packages/foo, apps/bar

## Objective

이 태스크가 달성하려는 목표 (1-3문장).

## Plan

- [ ] 단계 1
- [ ] 단계 2
- [ ] 단계 3

## Progress

### YYYY-MM-DD

- 단계 1 완료
- 단계 2 시작

## Decisions

- 접근 A를 B 대신 선택한 이유 ...

## Blockers

- (없음, 또는 현재 블로커 설명)

## Result

(완료 시 채움 — 수행된 내용 요약 및 후속 항목)
```

## 실행 단계

### 태스크 시작

1. `.agents/tasks/<task-name>.md`를 위 형식으로 생성.
   - 설명적인 kebab-case 이름 사용: `p1-improvements`, `cli-coverage`.
   - Status를 `in-progress`로 설정.
   - Objective와 초기 Plan 작성.

2. 태스크에 브랜치가 필요하면 새 브랜치 생성.

### 태스크 진행 중

3. 마일스톤 달성 시 Progress 섹션을 날짜별 항목으로 업데이트.
4. Plan 체크리스트 업데이트 — 완료 항목 체크, 새 항목 추가.
5. 주요 결정사항을 Decisions 섹션에 기록.
6. 블로커를 Blockers 섹션에 기록.

### 태스크 완료

7. Status를 `completed`로 변경.
8. Result 섹션에 요약 및 후속 항목 채우기.
9. 파일을 `completed/`로 이동:
   ```bash
   mv .agents/tasks/<task-name>.md .agents/tasks/completed/<task-name>.md
   ```
10. 이동된 파일을 관련 변경사항과 함께 커밋.

### 태스크 재개

11. `.agents/tasks/`에서 활성 태스크 파일 확인.
12. 태스크 파일을 읽어 컨텍스트 복원.
13. 마지막 Progress 항목에서 계속.

## 네이밍 규칙

- `<scope>-<description>.md` — 예: `p1-improvements.md`, `cli-coverage.md`
- 짧지만 설명적으로 유지.
- 날짜 접두사 불필요 — 파일 내 Created 필드로 추적.

## 체크리스트

- [ ] `.agents/tasks/`에 태스크 파일 생성
- [ ] Objective와 Plan 작성
- [ ] 마일스톤에서 Progress 업데이트
- [ ] Status가 현재 상태를 반영
- [ ] 완료 시 `completed/`로 이동
- [ ] 아카이브 전 Result 섹션 채우기

## Anti-Patterns

- 태스크 파일을 생성하고 업데이트하지 않음.
- 완료된 태스크를 active 디렉토리에 무기한 방치.
- 과도하게 상세한 Progress 작성 (간결하게 — 마일스톤 위주).
- 단일 커밋으로 처리 가능한 작업에 태스크 파일 생성.
- 동일 작업에 여러 태스크 파일 생성.
