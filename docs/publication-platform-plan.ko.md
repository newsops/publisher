# Publisher 출판 플랫폼 계획

> 언어: 한국어
> 최종 갱신: 2026-09-12
> 목적: 정적 CDN 기반의 다중 뉴스 사이트를 안전하게 운영하고, API 글쓰기·분석·광고를 일관된 플랫폼 계약 위에서 확장한다.

## 제품 방향

Publisher의 공개 사이트는 방문자 요청마다 애플리케이션 서버나
데이터베이스를 호출하지 않는다. 편집·발행이 끝난 결과를 정적 파일로
빌드하여 CDN에서 전달한다. 이 경계가 DDoS와 원본 장애 상황에서도 기사,
검색, RSS/Atom, sitemap, robots, 구조화 데이터가 계속 제공되도록 하는
핵심이다.

관리 기능은 별도의 인증된 admin 도메인에서만 제공한다. 공개 사이트는
admin, 데이터베이스, 플러그인 설정 API, 비밀 값에 런타임으로 의존하지
않는다.

이 제품은 한 번도 출시되지 않은 사전 검증 단계다. 따라서 이전 시험 코드를
보존하는 전환 모드, 이중 저장 경로, 이전 동작 호환 계층은 제품 개념으로
두지 않는다. 현재 계약은 PostgreSQL, 검증된 S3 호환 API, Node.js 22 admin,
OIDC/JWKS, 정적 공개 산출물의 단일 경로다.

## 핵심 원칙

1. **정적 우선**: 공개 페이지는 정적 CDN 산출물만 제공한다. 플러그인은
   방문자 요청 경로에 API route, middleware, server action, DB 조회,
   설정 fetch를 추가할 수 없다.
2. **통제된 플러그인**: WordPress식 업로드형 코드나 marketplace 설치가
   아니라, 저장소에 포함되어 검토된 어댑터만 설치한다. 안정된 ID·버전,
   명시된 capability, 유효성 검사, 사이트별 설정을 갖는다.
3. **다중 사이트 격리**: 설치·설정·권한·revision·발행 스냅샷은 정확히
   하나의 site ID에 속한다. 복제는 명시적으로 선택하며 대상 사이트에는
   비활성 설정만 복사한다.
4. **비밀 분리**: 공개 설정과 secret reference를 분리한다. 비밀 값과
   reference 이름은 admin 읽기 응답, 공개 JSON, HTML, feed, sitemap,
   로그, 사이트 복제에 포함하지 않는다.
5. **실패 격리**: 동의 거부, 광고 차단, 외부 스크립트 오류, 공급자 장애가
   기사 본문·SEO·탐색·키보드 접근·레이아웃·캐시 응답을 방해해서는 안 된다.
6. **편집 API 보존**: 글 생성·수정·발행 API는 자동화에 최적화된 상태로
   유지한다. 플러그인이 본문, 편집 상태, canonical, robots, sitemap,
   JSON-LD를 암묵적으로 바꾸지 못한다.
7. **무료·공급자 독립**: 플랫폼의 필수 동작은 Cloudflare를 포함한 특정
   공급자의 유료 플랜, 독점 런타임, 관리형 보안 기능에 의존하지 않는다.
   Cloudflare는 무료 조건을 다시 검증한 뒤 public DNS/CDN/정적 호스팅 역할에
   선택할 수 있을 뿐이며,
   정적 산출물·콘텐츠 스냅샷·인증 계약·발행 절차는 다른 CDN, 객체 저장소,
   표준 Node/컨테이너 환경으로 교체할 수 있어야 한다.

## 에이전트 우선 운영 방향

이 플랫폼의 장기 사용자는 브라우저를 조작하는 사람만이 아니다. 사람의 목표와
권한 아래에서 뉴스 사이트를 지속적으로 운영하는 에이전트도 일급 운영자다.
따라서 UI는 편의 계층이고, 운영의 기준 인터페이스는 다음 특성을 갖는 공개되고
버전된 기계 계약이다.

- 에이전트는 CLI와 인증된 API로 capability, 설정 누락, release/build 상태,
  실패 원인, 재시도 가능 여부를 사람이 읽는 화면 해석 없이 확인할 수 있어야
  한다. 결과는 schema version과 안정된 machine error code를 가진 JSON으로
  제공한다.
- 변경 요청은 명시적인 idempotency key와 operation ID를 갖는다. 에이전트는
  네트워크 재시도 뒤 같은 operation을 조회·재개할 수 있지만, 새 key로 같은
  부작용을 중복 생성하지 않는다.
- 에이전트는 PostgreSQL, object storage, Cloudflare, Vercel 같은 공급자 제어면을
  도메인 동작으로 직접 다루지 않는다. `publisher` CLI와 admin API가 이식 가능한
  운영 계약이고, 공급자 선택은 별도의 배포 어댑터다.
- 사람만 할 수 있는 결정은 기계적으로 드러나야 한다. 비용 승인, production DNS
  교체, 파괴적 삭제, 외부 계정 권한 부여, Device Authorization Grant의 사용자 코드
  승인은 에이전트가 암묵적으로 진행하지 않고 `AUTHORITY_REQUIRED` 상태와 필요한
  다음 행동으로 반환한다.
- Device Authorization Grant는 사람이 브라우저에서 좁은 범위의 권한을 승인하고
  CLI/에이전트는 코드·검증 URL·polling 상태만 다루게 하는 선택 어댑터다. access
  token은 명령 인자·JSON 결과·로그·저장소에 노출하지 않으며, 기본으로 영속 저장하지
  않는다.

이 방향은 자동화가 사람의 책임을 숨기는 방식이 아니라, 에이전트의 자동 실행과
사람의 명시적 권한 경계를 모두 감사 가능하게 만드는 것을 뜻한다. 새 기능은 이
계약을 우회하는 browser-only 흐름, 안정되지 않은 텍스트 파싱, 또는 조용한 권한
상승을 추가할 수 없다.

## 설계 중심과 불변식

이 플랫폼의 기준 아키텍처는 다음 한 문장으로 고정한다.

> **불변 snapshot → 명시적 의존성 graph → content-addressed 정적 artifact →
> 검증된 candidate → 원자적 release pointer**

```text
인증된 admin (Node.js 22)
  └─ PostgreSQL transaction: 편집 상태 + immutable snapshot + idempotent job
       └─ private S3-compatible store: snapshot / media / artifact bytes
            └─ provider-neutral builder: declared dependency graph + SHA-256 manifest
                 └─ candidate gate: checksum / schema / SEO / link / CSP /
                    projection reference / materialized-file / smoke
                      └─ compare-and-swap release pointer
                           └─ public static host: DB·admin·private store 없이 제공
```

각 계층의 책임을 섞지 않는다. PostgreSQL은 편집과 작업 상태의 source of
truth이고, private object store는 불변 byte 보관소이며, public static host는
검증을 끝낸 release directory만 제공한다. object store의 object를 바로 공개
원본으로 사용하거나, public 요청에서 PostgreSQL을 읽거나, 배포 공급자의 queue·
DB·runtime 타입을 snapshot과 manifest에 넣는 경로는 허용하지 않는다.

기사 HTML은 본문·제목·저자·시각·canonical·JSON-LD·핵심 탐색을 가진 SEO
문서다. home, recent, 근거가 있는 popular, category, author, 월별 archive,
search HTML/index, feed, sitemap, 승인 댓글 projection, media, runtime/theme,
release policy는 모두 같은 graph의 독립 artifact다. 어떤 공개 경로도 graph
밖에서 임의 생성하지 않으며, graph 완전성 검사가 누락과 중복을 거부한다.

## 공급자 및 비용 독립성 계약

다음 항목은 배포 편의가 아니라 시스템의 비협상 계약이다.

- 공개 빌드는 Cloudflare 계정이나 비밀 값 없이 로컬에서 완성되어야 하며,
  결과 디렉터리는 표준 정적 호스팅 또는 CDN에 그대로 배포할 수 있어야 한다.
- 핵심 콘텐츠·플러그인·발행 스냅샷 형식에는 D1, R2, Workers, Pages,
  Cloudflare Access 전용 타입이나 식별자를 넣지 않는다. 공급자별 연결은
  명시적인 어댑터와 배포 설정에만 둔다.
- admin 인증은 검증 가능한 표준 JWT/OIDC 또는 동등한 인증 경계를 계약으로
  삼는다. Cloudflare Access는 그 계약을 만족하는 선택 어댑터이지 필수
  인증 제공자가 아니다.
- 관계형 데이터의 기준 제품은 **PostgreSQL**이고 객체 데이터의 기준 계약은
  **검증된 S3 호환 API 부분집합**이다. Neon, D1, R2, AWS S3, Backblaze B2,
  MinIO 같은 이름은 핵심 도메인 모델이 아니라 선택 가능한 호스팅·어댑터에만
  나타난다.
- 릴리스 명령은 공통 build/validate/materialize/smoke 단계와 공급자별 deploy
  어댑터를 분리한다. Cloudflare CLI가 없어도 정적 산출물과 검증 결과를
  만들 수 있어야 한다.
- Cloudflare Pages/Workers Free만으로 가능한 역할은 우선 그 범위에서
  사용한다. R2처럼 무료 포함량과 별도로 결제 계정이 필요한 서비스는
  운영자가 비용 정책과 월 상한을 명시적으로 승인한 경우에만 선택한다.
- 무료 한도에 도달했을 때 자동 유료 전환이나 조용한 과금을 허용하지 않는다.
  배포 전 사전 검사는 선택한 비용 정책, 구독, 사용량 과금 가능 설정을
  대조하고, 증거가 없거나 한도를 넘으면 실패한다.
- 비용 검증은 기능 검증과 별개의 릴리스 게이트다. 공급자 콘솔의 실제 구독,
  갱신, 사용량 과금 상태를 확인하지 못하면 해당 비용 정책의 배포 완료로
  기록하지 않는다.

## 영속성 제품 결정

| 데이터                                            | 기준 계약            | 초기 선택                                                    | 교체 가능성                                                                |
| ------------------------------------------------- | -------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| admin 콘텐츠·분류·플러그인·감사·릴리스 메타데이터 | PostgreSQL           | Neon Free를 초기 호스팅 예시로 권장하되 필수로 지정하지 않음 | 표준 PostgreSQL 연결과 migration을 지원하는 관리형 또는 자체 호스팅 서비스 |
| 댓글                                              | PostgreSQL           | admin과 별도 DB 또는 schema 및 별도 최소권한 계정            | 같은 서버를 쓸 수 있으나 테이블과 자격증명을 공유하지 않음                 |
| 이미지·첨부·불변 발행 snapshot                    | S3 호환 API          | 사업자 미고정; 로컬은 MinIO 또는 파일 fixture                | R2, AWS S3, Backblaze B2, MinIO 등 호환성 시험을 통과한 구현               |
| 공개 사이트                                       | 완성된 정적 artifact | 무료 정적 호스팅/CDN                                         | Cloudflare Pages를 포함한 임의의 정적 호스트                               |

D1은 Cloudflare가 제공하는 SQLite 계열 제품이므로 영속성 기준 DB로 사용하지
않는다. 출시 데이터가 없는 시험 구현의 D1 runtime, binding, 환경 변수,
migration, 테스트와 배포 지침은 모두 삭제한다. D1 import adapter, fallback,
이중 쓰기도 만들지 않는다. 관계형 저장소를 `표준 SQL 계열`처럼 넓게 열어두는
것도 금지한다. 애플리케이션이 실제로 보장하는 제품과 migration 문법은
PostgreSQL로 고정해 테스트 가능한 범위를 만든다.

### PostgreSQL과 Neon Free

시스템이 의존하는 것은 Neon이 아니라 PostgreSQL wire protocol, transaction,
index, constraint와 `DATABASE_URL`이다. 핵심 경로에서는 Neon Auth, Data API,
branching 또는 Neon 전용 serverless transport를 사용하지 않는다. Neon 계정은
인프라 운영자 한 명이 만들고 연결 문자열만 배포 비밀로 전달하면 되므로,
편집자나 프로젝트 적용자는 Neon 제품을 따로 배울 필요가 없다.

2026-09-11 공식 가격표 기준 Neon Free는 카드 없이 `$0`, 프로젝트당 월
100 CU-hour, 0.5 GB 저장 공간, 최대 2 CU, 유휴 5분 후 scale-to-zero,
최대 6시간 또는 1 GB 변경 범위의 복구를 제공한다. 이는 간헐적으로 쓰는
초기 admin에는 합리적이지만, 상시 연결·큰 데이터·짧은 cold-start도 허용하지
않는 서비스의 보장값은 아니다. Free에는 SLA가 없고 공식 SLA는 Business 또는
Scale 구독에만 적용된다. 따라서 Neon Free를 유일한 원본이나 가용성 보증으로
간주하지 않는다.

- 프로비저닝 때마다 [Neon 가격표](https://neon.com/pricing),
  [scale-to-zero 설명](https://neon.com/docs/introduction/scale-to-zero),
  [SLA](https://neon.com/sla), [상태 페이지](https://neonstatus.com/)를 다시
  확인한다. 문서의 수치는 2026-09-11 평가 기록이지 영구 계약이 아니다.
- 애플리케이션 연결은 재연결·지수 backoff·짧은 transaction을 지원하고,
  서버리스/다중 인스턴스에서는 PostgreSQL 호환 pool endpoint를 사용할 수 있다.
- 매일 provider 외부 위치에 논리 backup을 남기고, 빈 PostgreSQL 인스턴스에
  복구하는 시험을 정기적으로 수행한다. 무료 플랜의 point-in-time restore는
  편의 기능일 뿐 backup 계약이 아니다.
- 무료 한도 또는 운영 요구를 넘으면 다른 PostgreSQL로 이전하거나 별도 승인된
  유료 계획을 선택한다. 공급자 교체에는 앱·콘텐츠 schema 변경이 없어야 한다.

### 이미지와 S3 호환 객체 저장소

이미지 업로드를 `R2 또는 S3`라는 양자택일로 만들지 않는다. 제품 계약은 S3
호환 API이며 AWS S3도 R2도 그 구현 중 하나다. 공통 어댑터가 보장하는 범위는
`PutObject`, `GetObject`, `HeadObject`, `DeleteObject`, `ListObjectsV2`,
multipart upload와 만료되는 signed URL이다. S3 호환 제품마다 지원 차이가
있으므로 이름만 호환이라고 가정하지 않고 동일 contract test를 통과시킨다.

```text
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_REGION
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY_ID
OBJECT_STORAGE_SECRET_ACCESS_KEY
OBJECT_STORAGE_PUBLIC_BASE_URL
OBJECT_STORAGE_FORCE_PATH_STYLE
```

AWS S3처럼 endpoint를 SDK가 유도할 수 있는 경우에만
`OBJECT_STORAGE_ENDPOINT`를 생략한다. 핵심 코드·snapshot·콘텐츠에는
`R2_BUCKET`, account ID, 사업자 console URL 같은 전용 식별자를 저장하지
않는다. R2를 나중에 선택하더라도 Worker 전용 binding 대신 이 S3 계약으로
연결한다.

- 원본 bucket과 원본 이미지는 private이다. 인증된 admin은 짧은 signed upload
  또는 서버 proxy로 업로드한다.
- DB에는 `site_id`, 논리 object key, SHA-256, MIME type, byte 크기, 가로·세로,
  처리 상태와 시각을 저장한다. 기사 본문에는 사업자 URL 대신 media ID 또는
  논리 key를 저장한다.
- key는 `sites/{siteId}/media/{sha256}/original.ext`와 같은 불변 규칙을 쓰고,
  공개용 WebP/AVIF 및 크기별 variant도 checksum 기반으로 만든다.
- 발행 시 승인된 이미지를 정적 artifact로 materialize하는 방식을 우선한다.
  별도 media 도메인을 쓰더라도 운영자 소유의 안정된 hostname을 사용하므로
  bucket 교체가 기사 데이터를 바꾸지 않는다.
- snapshot과 media는 같은 제품을 쓸 수 있지만 논리 prefix, bucket 또는
  자격증명을 분리할 수 있어야 한다.

Cloudflare 공식 문서는 R2 시작 전에 R2 구독을 checkout해야 하며 월 무료
사용량을 넘으면 사용량에 따라 과금된다고 명시한다. Standard storage에는
월 10 GB-month, Class A 100만, Class B 1,000만 요청의 무료 사용량이 있지만
이는 결제/구독 없는 완전 무료 제품이라는 뜻이 아니다. R2를 선택하면
[R2 시작 조건](https://developers.cloudflare.com/r2/get-started/),
[현재 가격](https://developers.cloudflare.com/r2/pricing/),
[S3 호환 범위](https://developers.cloudflare.com/r2/api/s3/api/)를 확인하고
비용 게이트를 통과해야 한다. AWS S3도 일반적인 사용량 과금 제품이므로 무료
기본값으로 간주하지 않는다. Backblaze B2나 MinIO 같은 후보도 동일한 API,
비용, 복구 시험을 통과해야 한다.

## 구현 및 출하 계획

1. 승인된 플랫폼 계약에 따라 PostgreSQL과 S3 호환 단일 경로를 구현한다.
2. admin과 comments의 PostgreSQL schema·migration·분리 자격증명 및 repository
   contract test를 로컬 wire-protocol fixture에서 검증한다.
3. 체크인된 파일 fixture의 row 수·site ownership·checksum을 대조한 뒤
   PostgreSQL과 S3 호환 fixture store로 가져온다. 출시 데이터가 없으므로
   다른 데이터베이스나 bucket을 위한 importer와 fallback은 만들지 않는다.
4. S3 호환 object-store adapter, signed upload, 이미지 검증·metadata·variant,
   snapshot과 content-addressed artifact 경로를 동일 contract test로 검증한다.
5. build job은 `queued → running → verifying → ready → published`만 허용하고,
   checksum 오류나 오래된 activation은 이전 release를 유지한다.
6. DB와 객체 저장소를 차단한 상태에서도 마지막 정적 artifact가 기사·이미지·
   feed·검색을 제공하는지 확인한다.
7. 비용 상태, backup/restore, provider 교체, 공개/admin 도메인 분리까지 실제
   계정에서 확인한 뒤에만 production release를 WEB-001 완료 증거로 기록한다.

## 증분 정적 발행과 대규모 기사 아카이브

관리자 요청 안에서 HTML을 직접 생성하지 않는다. 발행 요청은 검증된 편집
상태로부터 불변 snapshot과 checksum을 만들고 PostgreSQL에 멱등적인 build job을
기록한 뒤 즉시 `snapshotId`와 `jobId`를 반환한다. 로컬 프로세스, 컨테이너,
CI 등으로 교체 가능한 builder가 job을 가져가며, 특정 공급자의 queue나 유료
build 제품은 필수 계약이 아니다.

builder는 이전 release의 artifact manifest와 새 입력의 의존성 digest를
비교한다. manifest는 모든 route와 asset에 SHA-256, content type, cache class,
선언된 입력 의존성, 원본 release와 S3 호환 object key를 기록한다. 변경되지
않은 artifact는 content-address로 재사용하고, 파일시스템 materializer는 검증된
이전 파일의 hard link를 우선 사용한다. 내용이 실제로 달라진 파일만 렌더링·
업로드한다. 동일 release ID를 재시도할 때도 기존 candidate의 manifest와 모든
파일 checksum이 정확히 일치하는 경우에만 덮어쓰기 없이 재사용한다.

후보 release는 checksum·schema·링크·SEO·CSP·runtime/projection reference·
완전 materialization·smoke 검증을 모두 통과한 뒤에만 현재
deployment 또는 release pointer를 원자적으로 교체한다. 실패하거나 오래된
worker가 완료한 후보는 현재 release를 바꾸지 못하며, rollback은 이전에 검증된
manifest를 재선택하고 새 build를 요구하지 않는다.

### SEO 데이터와 변경이 잦은 projection의 경계

기사의 제목, byline, 발행·수정 시각, 본문과 heading, 이미지 대체 텍스트,
canonical, description/social metadata, `NewsArticle` JSON-LD, breadcrumb와 핵심
카테고리·archive navigation은 의미론적 정적 HTML에 포함한다. JavaScript,
PostgreSQL, admin, 댓글 API 또는 private object store가 없어도 읽고 탐색할 수
있어야 한다.

반면 한 값이 바뀔 때 모든 기사 HTML을 무효화하는 전역 데이터는 projection으로
분리한다.

- 최근글은 home, category/archive, feed와 crawl 가능한 `/recent/` 정적 페이지에
  build-time으로 포함한다. 기사 sidebar는 같은 origin의 versioned recent JSON을
  지연 로드하고, 실패 시 `/recent/`로 가는 정적 링크를 남긴다.
- 인기글은 ranking source, 기간, 생성 시각, 개인정보·보존 정책이 검증된 경우에만
  `/popular/`와 versioned JSON으로 만든다. 근거가 없으면 `인기글`이라 부르지 않고
  기존 편집자 추천을 유지한다.
- 댓글은 격리된 comment service에서 지연 로드한다. 선택적으로 승인·정제된 댓글만
  기사별 checksum-addressed projection으로 발행할 수 있다. 고정된 기사별 URL은
  짧게 재검증하는 pointer일 뿐이며 불변 projection을 가리킨다. 변경 시 pointer와
  그 projection 또는 명시적으로 static embedding한 해당 기사 한 개만 무효화한다.
  pending/rejected/raw 댓글은 public snapshot에 넣지 않는다.

따라서 새 기사 한 건은 해당 기사와 영향을 받은 home/category/author/archive,
feed, sitemap, search projection만 변경한다. recent/popular 순서 변경은 전용
페이지와 JSON만 바꾸며 기존 기사 HTML은 0개 변경한다. 공통 semantic markup,
canonical 또는 JSON-LD 계약 변경만 의도적인 전체 기사 rebuild 사유다.

### HTML과 시각 테마의 분리

공개 HTML은 테마와 무관한 semantic element, 안정된 class와 named slot만 가진다.
기본 가독성과 focus/keyboard 동작을 제공하는 작은 baseline style은 항상 남긴다.
시각 테마는 같은 origin에서 제공하는 checksum-addressed CSS/JS bundle이며,
모든 HTML에 고정된 작은 bootstrap이
`/.well-known/publisher/runtime.json`의 현재 bundle version을 읽어 적용한다.

색상, 글꼴, 간격, density와 비의미적 layout 또는 `themeId`를 바꾸면 새 theme
bundle과 작은 runtime manifest만 올린다. 1,000개의 기사 HTML checksum은 그대로다.
JavaScript나 manifest를 차단해도 baseline theme, 기사 본문, metadata와 핵심
navigation은 남는다. theme JavaScript는 기사 내용, 접근성 이름, canonical 또는
SEO metadata를 생성할 권한이 없다. markup/필수 slot 변경이 필요한 테마는 단순
시각 테마가 아니라 semantic template version 변경으로 취급해 영향 route를
명시적으로 다시 만든다.

기본 runtime/theme/projection은 모두 self-hosted이고 exact CSP에서 `'self'`만
사용한다. versioned bundle은 장기 immutable cache, 작은 runtime pointer는 짧은
재검증 대상으로 분리하며, 새 bundle 업로드와 검증을 끝낸 후 pointer를 마지막에
교체한다.

### 1,000개 기사 검증 기준

결정론적 1,000개 fixture에서 no-op 발행과 시각 테마 변경은 기사 HTML render와
upload가 각각 0이어야 한다. 기사 한 건 수정은 기사 HTML 정확히 1개와 dependency
graph가 선언한 index만 바꾸고, 댓글 projection 변경은 기사 HTML 최대 1개만
바꾼다. 공통 semantic article template version 변경은 1,000개 전체를 의도적으로
무효화해야 한다. 이 행렬, 원자적 활성화, 장애 시 이전 artifact 생존은
자동화 시험으로 관리한다.

## 발행과 플러그인 흐름

```text
admin / site-scoped API
  → 검증된 플러그인 설치 설정 (revision-safe)
  → 사이트별 발행 스냅샷 (public-safe projection만)
  → 정적 빌드 입력 materialization
  → typed head / named-slot contribution + exact CSP
  → 정적 HTML·feed·sitemap·ads.txt(지원되는 어댑터만)
  → CDN 배포
```

이 흐름에서 독자는 이미 생성된 파일만 받는다. 외부 분석 또는 광고
스크립트는 선택적인 브라우저 향상 기능일 뿐, 공개 문서를 전달하는
의존성이 아니다.

## 구현 상태

| 영역                          | 상태                                             | 결과                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 정적 공개 사이트와 별도 admin | 단일 PostgreSQL/S3 계약 구현 완료, pilot 검증 중 | 공개 정적 export, 일반 OIDC, PostgreSQL, S3 호환 저장, 비용 정책별 fail-closed preflight가 구현됐다. 특정 사업자 결제 상태는 공개 저장소에 기록하지 않는다. |
| AI 지원 배포 온보딩           | 가이드 완료, 첫 pilot 대기                       | 선택 인터뷰, 공식 비용 검증, 권한·비밀 경계, AI 실행, 검증·인계를 한 문서로 연결했다. 저장소 소유자의 첫 실배포 전까지 `pilot-pending`이다.                 |
| 증분 정적 발행·runtime 테마   | 구현 완료, 최종 회귀 검증 중                     | 의미론적 SEO HTML, route 의존성 manifest, 전역 projection, self-hosted theme bundle, 원자적 활성화와 1,000개 기사 invalidation 회귀 시험을 구현했다.        |
| 다중 사이트 플러그인 플랫폼   | 완료                                             | typed registry, 사이트별 설치, revision-safe API/UI, public-safe snapshot, build-time CSP, 복제·비밀 격리, 장애 회복 검증을 제공한다.                       |
| Google Analytics 4            | 완료                                             | `google.analytics`는 GA4 measurement ID만 받고, 기본 동의 모델에서 승인된 consent signal 이후에만 플랫폼 소유 loader가 태그를 비동기로 추가한다.            |
| Google AdSense                | 아키텍처 결정 대기                               | named-slot·static ads.txt 설계는 작성됐지만, Google의 현재 CSP 요구가 완전 정적 exact-origin CSP 계약과 충돌한다. 승인 없는 우회 구현은 하지 않는다.        |

## Google Analytics 계약

Analytics 설정은 공개 식별자인 `G-…` measurement ID와
`consent: granted | denied`만 허용한다. API key, 관리 credential, 임의 URL,
HTML, JavaScript는 거부한다.

- 기본값 `denied`는 Google 태그·Google CSP origin을 산출물에 넣지 않는다.
- `granted`여도 공개 사이트가 요청을 즉시 전송하지 않는다. 승인된 CMP 또는
  consent UI가 `window.__publisherConsent.analytics = true`를 설정하거나
  `publisher:consent` 이벤트를 보내야 loader가 태그를 만든다.
- 차단·실패 상황에서도 정적 기사와 SEO 산출물은 그대로 남는다.

## Google AdSense의 명시적 결정 지점

광고는 Auto ads 또는 운영자 HTML 붙여넣기로 구현하지 않는다. 지원한다면
검토된 named slot, 공개 publisher/slot ID, 정적 `ads.txt`, 플랫폼 소유
responsive layout만 사용한다.

그러나 Google의 현재 AdSense CSP 안내는 허용 리소스 도메인이 변할 수 있고
strict CSP에는 응답마다 생성하는 nonce를 요구한다. 현재의 immutable static
Pages header와 exact-origin 플러그인 계약으로는 그 요구를 지원되는
프로덕션 통합으로 표현할 수 없다.

따라서 다음 중 하나를 **별도 승인**으로 선택해야 한다.

1. 정적 CSP 계약을 유지하고 AdSense 어댑터를 보류한다.
2. 원본 서버 없이 CDN edge에서 nonce/HTML을 변환하는 새 아키텍처를
   명세·위협 모델·성능·캐시·DDoS 검증과 함께 승인한다.

두 번째 선택지는 특정 Cloudflare 유료 edge 기능을 전제로 할 수 없다.
공급자 중립적인 실행 계약, 무료 배포 가능성, 대체 런타임 검증이 함께
증명되지 않으면 승인 대상이 아니며 첫 번째 선택지를 유지한다.

저장된 광고 설정은 Google 사이트 승인, 정책 준수, 법적 동의 충족을 뜻하지
않는다. 운영자는 소유권/승인, 최신 정책, CMP, `ads.txt`, 차단 시 layout,
롤백을 각 사이트마다 검증해야 한다.

## 운영 및 확장 순서

1. PostgreSQL migration과 S3 호환 contract test를 통과시키고 다른 저장 경로를
   추가하지 않는다.
2. 콘텐츠와 플러그인 변경은 admin 또는 versioned site API로 작성한다.
3. 설정을 validate하고 revision 충돌을 해소한 뒤 enable한다.
4. 발행해서 immutable public snapshot과 정적 artifact를 생성한다.
5. desktop/mobile에서 기사·search·feed·sitemap·metadata·keyboard·overflow·
   console을 확인한다.
6. 공급자 장애나 정책/동의 미검증 시 어댑터를 disable하고 새 정적 artifact를
   발행한다. 이미 배포된 파일을 런타임으로 변경하지 않는다.
7. 새 플러그인은 공식 문서 조사, typed manifest, site-scoped config,
   exact origin/slot budget, secret projection, disabled/failure tests,
   operator runbook을 먼저 갖춘 뒤 별도 승인으로 구현한다.
8. 배포 전 비용 게이트에서 활성 유료 구독과 과금 가능 필수 기능을 확인한다.
   하나라도 발견되면 릴리스를 중단하고 구독을 취소하거나 무료·자체 호스팅
   어댑터로 교체한 뒤 처음부터 smoke 검증을 다시 수행한다.

## 관련 문서

- [AI 지원 배포·온보딩 가이드](./ai-assisted-deployment.ko.md)
- [개발 기준](./development-spec.md)
- [플러그인 운영 가이드](./plugins.md)
- [플러그인 시스템 조사와 ADR](./research/plugin-system-evaluation.md)
- [배포·운영 전제](./deployment.md)
