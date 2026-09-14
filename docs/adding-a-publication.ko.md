# 새 매체 추가 운영 매뉴얼

이 문서는 하나의 Publisher 설치에서 별도 도메인과 독립 콘텐츠를 가진 새
매체를 추가하는 반복 가능한 절차다. 특정 호스팅 사업자, 계정 ID, 버킷 이름,
API key 또는 실제 도메인 값은 포함하지 않는다.

## 불변식

- 매체는 안정적인 `siteId`를 갖고, 콘텐츠·미디어·댓글·스냅샷·build job·감사
  기록이 그 `siteId`에 귀속된다.
- 사람용 웹 UI와 에이전트용 CLI/API는 같은 매체 생성·설정·콘텐츠·발행·복구
  capability를 독립적으로 제공한다. 어느 쪽도 다른 쪽의 보조 수단이 아니다.
- 관계형 상태는 PostgreSQL, 파일과 snapshot은 검증된 S3 호환 API, 공개 결과는
  검증된 정적 artifact만 사용한다. 사업자 이름은 운영 어댑터에만 둔다.
- 공개 도메인의 DNS, 비용이 발생할 수 있는 리소스, 기존 production 데이터의
  삭제·덮어쓰기는 준비를 끝낸 뒤 해당 실행 직전에만 소유자가 승인한다.

## 사전 확인

1. 기존 매체의 현재 release와 backup/rollback 지점을 기록한다.
2. 새 `siteId`, 표시 이름, HTTPS canonical origin, 기본 theme, 언어·locale을
   정한다. `siteId`는 소문자·숫자·하이픈만 사용한다.
3. 새 도메인의 DNS zone 소유권과 선택한 정적 호스트의 연결 가능 여부를
   읽기 전용으로 확인한다.
4. 새 매체에 쓸 automation key에는 정확한 `siteId`만 허용한다. key와 DB 또는
   object-storage 자격증명은 저장소·명령 인자·JSON 출력·감사 로그에 남기지
   않는다.

## 생성과 초기화

사람은 인증된 admin UI의 **Create publication** 화면에서, 에이전트는 다음과
같은 CLI 계약으로 새 매체를 생성할 수 있다.

```bash
publisher site create \
  --site <site-id> \
  --name '<publication name>' \
  --canonical-origin https://<publication-domain> \
  --non-interactive --json

publisher site bootstrap --site <site-id> --non-interactive --json
```

초기화는 해당 매체의 빈 설정만 만들며, 다른 매체의 글·저자·분류·미디어를
복사하지 않는다. 재시도는 idempotent result를 반환해야 한다. UI도 같은
validation·권한·audit 결과를 보여야 한다.

## 편집과 정적 release

1. 새 매체 안에서 저자와 분류를 만들고, 매체 고유의 설정을 저장한다.
2. UI 또는 CLI/API로 콘텐츠와 승인 미디어를 등록한다. 모든 요청은 site-scoped
   endpoint와 revision 또는 idempotency key를 사용한다.
3. publish를 요청하고 builder가 만든 candidate manifest의 `siteId`, snapshot key,
   media key가 모두 `sites/<site-id>/` 아래인지 확인한다.
4. 정적 artifact만 별도 public-host 프로젝트에 배포한다. build는 database,
   admin, private object storage에 런타임으로 연결되지 않아야 한다.
5. canonical, robots, sitemap, feed, JSON-LD, 이미지, desktop/mobile 스타일,
   cache headers를 candidate URL에서 확인한다.

## 도메인 활성화와 rollback

1. 실제 production DNS 변경 직전에 소유자에게 target hostname, target public
   project, 기존 레코드 영향만 좁게 제시하고 승인을 받는다.
2. 승인 뒤에만 apex와 필요한 `www` 레코드를 새 public project에 연결한다.
3. HTTPS 200, canonical/OG metadata, 정적 cache 정책, 모바일·데스크탑 렌더링을
   확인하고 기존 매체 URL도 다시 확인한다.
4. 장애가 나면 이전에 검증된 static release를 다시 선택한다. DB나 다른
   매체의 object prefix를 삭제·덮어써서 rollback하지 않는다.

## 완료 기록

운영 기록에는 site ID, release ID, checksum, 확인한 public URL, DNS 승인 시각,
검증 결과와 rollback 대상만 남긴다. 비밀 값, 계정 ID, provider endpoint,
원본 미디어 또는 사용자 데이터는 기록하지 않는다.
