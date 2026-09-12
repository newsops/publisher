# AI 종합 배포 지원 가이드

> 가이드 상태: `pilot-pending`
>
> 최초 검증 고객: 저장소 소유자

이 문서는 누군가가 저장소를 클론한 뒤 LLM에게 “어떻게 배포해?”라고
물었을 때 사용하는 최상위 실행 계약이다. AI는 특정 회사를 먼저 정하지
않고 사용 목적과 비용 조건을 확인한 뒤, 각 역할의 후보를 비교해 사용자가
선택하게 한다. 선택 후에는 사용자가 허용한 범위에서 계정 설정, 환경 변수,
마이그레이션, 빌드, 배포, 복구 시험을 대신 수행한다.

이 제품은 아직 출시된 적이 없다. 따라서 이전 시험 구현을 보존하는
호환 모드나 이중 런타임을 만들지 않는다. 정식 계약은 PostgreSQL,
검증된 S3 호환 API, 애플리케이션 소유 계정·세션, 정적 산출물뿐이다.

## 현재 배포 가능 상태

| 영역            | 구현 상태                                                | production 완료 조건                                    |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| public          | SEO가 포함된 정적 HTML과 증분 산출물 구현·로컬 검증 완료 | 선택한 host의 실제 URL, TLS, cache, 장애, rollback 관찰 |
| admin DB        | `DATABASE_URL` PostgreSQL 구현·통합 시험 완료            | 사용자 계정의 DB 생성, migration, backup/restore 증거   |
| comments DB     | 별도 `COMMENTS_DATABASE_URL` 구현·격리 시험 완료         | 별도 사용자/DB와 cross-credential deny 관찰             |
| 이미지·snapshot | 일반 `OBJECT_STORAGE_*` S3 계약 및 이미지 검증 구현 완료 | 선택한 bucket에서 계약 시험과 외부 backup 관찰          |
| 발행            | idempotent queue와 `publication:next` 구현 완료          | 선택한 정적 배포 adapter의 원자적 activation 관찰       |
| 인증            | PostgreSQL 기반 자체 계정·세션 구현 완료                 | 첫 owner 생성, 폐기·역할 경계 관찰                      |
| 비용            | `$0` fail-closed preflight 구현 완료                     | 30일 이내 공식 가격·결제 상태 증거                      |

로컬 검증은 production 배포가 아니다. 현재 저장소 상태는 플랫폼 계약이
구현된 `pilot-pending`이며, 원격 사업자와 DNS는 소유자 선택 전이다.

## 선택 인터뷰

AI는 다음 질문을 한 번에 길게 던지지 않는다. 이미 답한 내용은 다시 묻지
않고, 결정에 필요한 1~3개 질문씩 진행한다.

### 1. 목표와 비용

- 공개할 도메인과 예상 기사 수·월간 트래픽
- 관리자 사용 인원과 댓글 사용 여부
- 운영자가 선택할 비용 정책:
  - `free-only`: 카드·사용량 과금·유료 기능 없이 검증된 월 상한 `$0`
  - `free-allowance-with-billing`: 무료 사용량이 있지만 결제 계정이 필요한 상품 허용
  - `paid-approved`: 사용자가 명시한 월 상한 안에서 유료 상품 허용
- 백업 보관 위치와 허용 가능한 복구 시간

각 pilot은 운영자가 실제 비용 정책을 명시한 뒤에만 시작한다. `free-only`는
결제 활성화가 필요한 R2를 선택할 수 없다. R2처럼 무료 포함량은 있지만
과금 계정이 필요한 서비스를 선택하려면 `free-allowance-with-billing` 또는
`paid-approved`와 월 상한을 기록해야 한다. Workers Paid, 유료 WAF, 유료 Bot
기능은 별도 명시 승인 없이는 선택하지 않는다.

### 2. 역할별 플랫폼 선택

AI는 아래 역할을 묶어서 하나의 “Cloudflare 배포”라고 부르지 않는다.

| 역할                 | 필수 제품 능력                                       | 선택 예시                                          |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| 정적 public host/CDN | 불변 candidate, 원자적 승격 또는 동등 보장, rollback | 파일시스템 origin, 검증된 정적 host                |
| admin runtime        | 비밀 환경 변수를 가진 Node.js 22/Next runtime        | container 또는 관리형 Node                         |
| admin identity       | 자체 계정, 암호 해시, 폐기 가능한 secure session     | Publisher admin runtime                            |
| PostgreSQL host      | 표준 connection string, transaction, logical export  | Neon Free, 다른 관리형 PostgreSQL, 자체 PostgreSQL |
| S3 호환 object store | put/get/head/list/delete/multipart/signed URL        | MinIO 또는 계약 시험을 통과한 hosted endpoint      |
| comments/contact     | 분리된 API, rate limit, moderation                   | 미사용 또는 별도 runtime                           |
| provider 외부 backup | 빈 DB/bucket restore가 가능한 독립 복사본            | 암호화 로컬/다른 사업자/offline 저장소             |

Neon을 선택해도 제품이 Neon SDK를 사용하지 않는다. 평범한 PostgreSQL
URL만 사용하므로 다른 PostgreSQL로 옮길 수 있다. AI는 가입 전에 현재 공식
Free 한도, scale-to-zero 동작, 복구 보존 기간, SLA 적용 plan, export와
계정 삭제 절차를 다시 확인한다. Free plan은 유일한 백업으로 간주하지 않는다.

Object storage도 특정 제품명이 계약이 아니다. 후보가 S3 호환 시험을
통과하고 비용 정책을 만족할 때만 일반 환경 변수로 연결한다. public 문서에는
사업자 console URL이나 bucket 식별자가 들어가지 않는다.

소유자의 `free-only` pilot에서 Cloudflare는 공식 `$0` 조건을 다시 확인한
public DNS/CDN/정적 호스팅 후보일 뿐이다. admin Node runtime, PostgreSQL,
private object storage의 필수 제공자로 간주하지 않으며 저장소에는 Cloudflare
전용 admin build나 저장소 binding이 없다.

### 3. 기능 선택

- 댓글을 지금 켤지, 읽기만 켤지, 완전히 끌지
- human verification 사업자와 개인정보·보존 정책
- 인기글을 켤지: 집계 source, window, timestamp, privacy 승인 없이는
  “인기글”을 표시하지 않고 편집자 추천만 사용
- 정적 댓글 SEO embedding을 켤지: 승인된 댓글만 한 기사 단위로 반영
- 선택 plugin이 요구하는 정확한 CSP origin

## 비용·신뢰성 게이트

AI는 검색 결과 요약이나 기억만으로 비용을 확정하지 않는다. 가입 또는
배포 직전에 사업자의 공식 가격, billing 문서, SLA, status/incident,
export/삭제 문서를 열어 다음을 기록한다.

- 확인 시각과 공식 URL
- plan 이름, 포함량, 초과 동작, 결제 활성화 필요 여부
- 카드 없이 월 상한 `$0`인지
- 지원/SLA 적용 plan과 장애 시 책임 경계
- 표준 export와 계정·bucket·project 삭제 절차

하나라도 `UNVERIFIED`이면 `free-only` production preflight는 실패한다.
“무료 사용량 포함”은 “결제 활성화 불필요” 또는 “월 상한 `$0`”와 같지
않다. 구매, 카드 등록, 사용량 과금 활성화, 유료 trial 시작은 사용자의
명시적 승인이 없으면 수행하지 않는다.

## 비밀이 없는 배포 프로필

선택 결과는 `.data/deployment-profile.yaml` 같은 gitignored 파일에 저장한다.
여기에는 사업자·region·plan·도메인·기능 선택과 비밀 변수의 **이름**만
기록한다. 값은 각 secret manager에 둔다.

```yaml
policy: free-only
publicHost:
  adapter: filesystem
  origin: https://www.example.com
database:
  engine: postgresql
  adminSecret: DATABASE_URL
  commentsSecret: COMMENTS_DATABASE_URL
objectStorage:
  protocol: s3-compatible
  bucketSecret: OBJECT_STORAGE_BUCKET
identity:
  protocol: local-accounts
  bootstrapSecret: ADMIN_BOOTSTRAP_SECRET
```

비밀은 shell trace, screenshot, commit, issue, PR, chat에 복사하지 않는다.
AI는 사용자의 비밀 저장소나 로컬 비공개 환경에서 값을 설정할 수 있지만
화면이나 답변에 값을 되풀이하지 않는다.

## AI 실행 프로토콜

### Phase 1 — 저장소와 현재 상태 확인

1. `AGENTS.md`, `CLAUDE.md`, 이 가이드, `docs/deployment.md`, 활성 spec과
   task를 읽는다.
2. `git status`, Node 22, pnpm lock, 테스트 상태를 확인한다.
3. 기존 계정·DNS·데이터가 있는지 read-only로 조사한다.
4. 구현된 adapter와 아직 구현·검증되지 않은 선택지를 구분한다.

### Phase 2 — 변경 전 실행 요약

AI는 사용자에게 아래를 먼저 보여준다.

- 선택한 각 역할의 사업자·plan과 선택 이유
- 월 상한, 결제 활성화, quota 초과 동작, SLA
- 생성할 DB/bucket/project/domain과 예상 변경
- 비밀이 저장될 위치
- 자동 수행할 명령과 사용자가 직접 해야 하는 계정 단계
- 실패 시 rollback과 삭제 절차

비용 정책을 바꾸거나 production DNS 변경, 기존 데이터 삭제·덮어쓰기,
외부 메시지 발송, 계정 폐쇄가 필요하면 작업을 멈추고 사용자의 명시적
결정을 받는다.

### Phase 3 — 공통 인프라 설정

1. 서로 다른 사용자/DB로 `DATABASE_URL`, `COMMENTS_DATABASE_URL`을 만든다.
2. private S3 호환 bucket과 최소 권한 credential을 만든다.
3. `ADMIN_BOOTSTRAP_SECRET`을 배포 비밀로 설정하고 admin public origin과
   분리한다. 최초 owner는 배포 후 보안 화면에서 자신의 암호를 직접 입력한다.
4. `persistence:migrate`를 두 scope에 실행한다.
5. 빈 설치라면 `fixture:reconcile`을 실행해 8개 일반 샘플 글·1개 태그·1개
   저자·0개 media checksum을 기록한다.
6. 외부 backup과 빈 target restore를 수행한다.
7. billing/recovery evidence를 만든 뒤 `deploy:preflight`를 통과시킨다.

### Phase 4 — 검증과 배포

1. `corepack pnpm typecheck`, `test`, `build`, `harness:scan`을 실행한다.
2. admin publish의 `202`, snapshot checksum, idempotent job을 확인한다.
3. `publication:next`로 candidate를 생성·검증·activation한다.
4. 선택한 static host에는 검증된 release directory만 전달한다.
5. public/admin 분리, direct-origin deny, cache, TLS, rate limit을 직접 관찰한다.
6. JS enabled/disabled와 runtime projection 차단 상태를 모두 확인한다.
7. DB/object store 차단 상태의 정적 페이지를 확인한다.
8. provider 외부 backup을 빈 DB/bucket에 restore하고 checksum을 비교한다.
9. 이전 release로 rollback smoke를 수행한다.

AI는 로그의 “성공” 문자열만 인용하지 않고 최종 URL과 상태를 직접
관찰한다. 테스트 실패, `UNVERIFIED`, 또는 미구현 adapter가 있으면 성공을
선언하지 않는다.

### Phase 5 — 인수인계

최종 답변과 `.data` 밖의 비밀 없는 증거 문서에는 다음을 남긴다.

- 선택한 제품/plan과 공식 근거 확인 시각
- 배포 URL, release ID, manifest checksum
- DB/bucket의 논리 이름과 secret 변수 이름
- backup/restore checksum과 rollback 결과
- 사용량 확인·백업·복구·회전·삭제 명령
- 실패·미검증·보류 항목과 정확한 다음 행동

## 첫 고객 pilot 절차

최초 고객은 이 흐름을 요청한 저장소 소유자다. `owner-first pilot`은 다음
조건을 모두 실제 계정에서 통과해야 한다.

1. 소유자가 `free-only`와 각 플랫폼 역할을 직접 선택한다.
2. AI가 비용과 변경 요약을 보여주고 허용 범위 안에서 설정을 수행한다.
3. migration, fixture reconciliation, publish, static activation, 자체 계정·세션,
   cache, 장애, restore, rollback을 직접 관찰한다.
4. 소유자가 인수인계 문서로 같은 작업을 재현할 수 있는지 확인한다.
5. 발견한 막힘을 문서·테스트·명령에 반영하고 전체 회귀를 다시 통과한다.

그 전에는 가이드 상태를 `pilot-pending`으로 유지하고 다른 사용자의 배포를
`validated`라고 표현하지 않는다. 완료 후에만 근거 링크와 날짜를 기록하고
`validated`로 바꾼다.

## AI의 사용자 응답 형식

배포 지원 답변은 다음 순서가 가장 명확하다.

1. 현재 결과 또는 정확한 blocker
2. 사용자가 선택해야 하는 플랫폼과 비용 차이
3. AI가 다음에 자동 수행할 변경
4. 별도 권한이 필요한 작업
5. 검증 결과와 rollback/복구 방법

사용자에게 이미 제공한 정보는 다시 요구하지 않는다. 사업자 선택과
외부 권한이 준비되면 가능한 작업은 끝까지 수행하되, production 완료는
실제 원격 증거가 있을 때만 선언한다.
