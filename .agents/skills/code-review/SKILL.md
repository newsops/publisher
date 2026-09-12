---
name: code-review
description: 6개 전문 관점(정확성·아키텍처·타입안전·보안·성능·유지보수) + 심각도 라벨로 변경된 파일/기능 영역을 체계적으로 리뷰. 머지 전 코드 품질·규칙 준수 점검 시 사용.
---

# Code Review

스펙 준수(코드↔스펙)는 `spec-code-conformance` 스킬이 담당. 이 스킬은 **스펙 무관 코드 품질**을 본다.

## Rule Anchor

- `AGENTS.md` > 타입 시스템(strict) / No-Fallback 원칙 / 개발 패턴 / 흔한 실수
- `CLAUDE.md` HARD GATE, `.agents/rules/`(no-legacy·git-branch·data-safety 등)

## 사용 시점

- 머지 전 변경 파일 세트 리뷰 / 기능 영역(app·feature 디렉토리) 품질 점검 / 주기적 헬스체크.

## 심각도 라벨

| 라벨         | 의미                                    | 조치                 |
| ------------ | --------------------------------------- | -------------------- |
| **MUST**     | 규칙 위반·버그·보안 이슈                | 머지 전 수정         |
| **SHOULD**   | 아키텍처 개선·테스트 누락·스펙 드리프트 | 현재/다음 이터레이션 |
| **CONSIDER** | 리팩터 기회·대안                        | 작성자 판단          |
| **NIT**      | 사소한 스타일·네이밍                    | 무시 가능            |

분류: AGENTS.md 필수 규칙 위반→MUST / 스펙 게이트 갭·미테스트 공개 표면→SHOULD / 그 외→CONSIDER·NIT.

## 6개 관점 (순서대로 적용)

1. **정확성** — 로직 버그·도달불가 경로, 엣지(null/undefined/빈 배열/경계), 에러 처리 완전성(catch 좁힘, silent swallow 금지), 불변식 위반, Promise(미처리 rejection·await 누락).
2. **아키텍처** — 레이어 경계(site는 admin 내부 import 금지, `@publisher/content`만 경유), 의존성 방향, SSOT(타입 재선언·1:1 자명 별칭 금지), 모듈 응집(god 파일 금지), import 표준(정적 기본·동적은 선택 모듈만), No-Fallback.
3. **타입 안전** — `any`/`{}`/`as any`/`as unknown as T` 금지, `unknown`은 신뢰 경계서 narrowing, interface/type 컨벤션, 내보낸 함수 명시적 반환 타입, 경계 타입가드.
4. **보안** — 하드코딩 시크릿/키 금지, 시스템 경계 입력 검증(사용자·외부 API), injection/XSS 벡터, `eval`/`new Function` 금지, 민감정보 로깅·에러 노출 금지. (관리자 인증·콘텐츠 HTML 정화 경계 주의.)
5. **성능** — 핫패스/루프 불필요 할당, N+1 쿼리, async 컨텍스트 동기 블로킹, 캐시(계산 전 확인·성공 후 저장), 무한 증가(배열/리스너 cleanup).
6. **유지보수** — 공개 표면 테스트 커버리지, 네이밍 명료성, 프로덕션 파일 >300줄→MUST 분할, 함수 >50줄→MUST 추출, 분기 >15→SHOULD 단순화, 데드코드, 매직넘버→SHOULD 상수화, 인자 mutation→MUST.

## 실행 단계

1. **범위**: 대상 app/feature·파일 세트 식별.
2. **컨텍스트**: 관련 spec-docs·진입점 읽어 경계·공개 표면 파악.
3. **스캔**: 프로덕션 소스 각 파일 읽기(테스트·예제·생성물 제외).
4. **리뷰**: 6관점을 각 파일에 적용. 심각도·관점·`file:line`·설명 기록.
5. **교차검증**: `pnpm --filter @publisher/site build` / `pnpm -r test` / `pnpm -r lint`.
6. **보고**: 아래 형식.

## 출력 형식

```
## [영역] Code Review
### Summary  | MUST/SHOULD/CONSIDER/NIT 카운트
### Findings  (심각도별: (관점) file:line — 설명)
### Positive  (유지할 잘된 점)
```

## 중단 조건

- 테스트·예제·생성물(`.d.ts`,`.next/`) 리뷰 금지.
- AGENTS.md가 명시 허용한 패턴(catch의 `unknown` 등) 플래그 금지.
- 리뷰 범위 밖 대규모 작업은 `.agents/backlog/` 항목으로 기록(즉시 구현 금지).

## 다른 스킬 관계

- 코드 변경 필요 발견 → 변경 후 `post-implementation-checklist`.
- 스펙 갭 → `spec-writing-standard` / `spec-code-conformance`.
