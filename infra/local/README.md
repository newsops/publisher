# Local clean-room test fixture

This PostgreSQL/MinIO fixture is for isolated development and CI, not production
hosting. It retains the existing MinIO server and client versions and the tested
S3 API; it does not select a provider for an operated publication.

## Build and run

Use a fresh explicit Compose project name for verification. Check that the
configured ports are free and do not replace another project's containers.

```sh
docker compose -p publisher-fixture -f infra/local/compose.yml build object-storage object-storage-init
docker compose -p publisher-fixture -f infra/local/compose.yml up -d --wait postgres object-storage
docker compose -p publisher-fixture -f infra/local/compose.yml run --rm object-storage-init
```

Run `pnpm clean-room:smoke` with the fixture-only environment documented in
[deployment verification](../../docs/deployment.md). No production credentials
belong in this fixture. Remove only the verification project that you created:

```sh
docker compose -p publisher-fixture -f infra/local/compose.yml down -v
```

## Artifact provenance

The old prebuilt MinIO container references no longer permit anonymous pulls.
The Dockerfile packages the exact official releases already used by this
fixture, from their public GitHub assets:

- [MinIO RELEASE.2025-09-07T16-13-09Z](https://github.com/minio/minio/releases/tag/RELEASE.2025-09-07T16-13-09Z),
  source commit `07c3a429bfed433e49018cb0f78a52145d4bedeb`.
- [mc RELEASE.2025-08-13T08-35-41Z](https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z),
  source commit `7394ce0dd2a80935aded936b09fa12cbb3cb8096`.

Both amd64 and arm64 have separately pinned SHA-256 values. Downloaded bytes
must match before becoming executable. Unsupported architectures, timeouts,
download errors and checksum mismatches fail the build; there is no alternate
download source or authentication fallback. The Dockerfile also retains each
upstream LICENSE, CREDITS and NOTICE from its exact source commit.

The base is Docker's [official Alpine image](https://github.com/docker-library/official-images/blob/master/library/alpine),
version 3.24.3, pinned by its multi-architecture manifest digest. The older
MinIO versions here are test fixtures, not a security/support recommendation
for production; the upstream projects are archived and the server now uses
[source-only distribution](https://github.com/minio/minio#source-only-distribution).

When changing a fixture version, verify official release provenance and both
architectures' checksums, update the Dockerfile and regression expectations,
then rebuild and run the actual clean-room smoke. Source contract tests alone
do not prove container startup or S3/database acceptance.
