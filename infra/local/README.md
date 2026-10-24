# Local clean-room test fixture

This PostgreSQL/MinIO fixture is for isolated development and CI, not production
hosting. It retains the existing MinIO server and client versions and the tested
S3 API; it does not select a provider for an operated publication.

## Build and run

Use a fresh explicit Compose project name for verification. Check that the
configured ports are free, or request Docker-assigned ports as described below.
Use the same project name for every command; concurrent runs need distinct names.

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

## Ports and parallel runs

Published ports bind only to `127.0.0.1`. Local defaults remain:

| Environment variable              | Default host port | Service port          |
| --------------------------------- | ----------------- | --------------------- |
| `PUBLISHER_FIXTURE_POSTGRES_PORT` | 55432             | `postgres:5432`       |
| `PUBLISHER_FIXTURE_OBJECT_PORT`   | 59000             | `object-storage:9000` |
| `PUBLISHER_FIXTURE_CONSOLE_PORT`  | 59001             | `object-storage:9001` |

To let Docker allocate all three host ports, set these values before startup:

```sh
export PUBLISHER_FIXTURE_POSTGRES_PORT=0
export PUBLISHER_FIXTURE_OBJECT_PORT=0
export PUBLISHER_FIXTURE_CONSOLE_PORT=0
```

After startup, discover the actual addresses with the same project name:

```sh
docker compose -p publisher-fixture -f infra/local/compose.yml port postgres 5432
docker compose -p publisher-fixture -f infra/local/compose.yml port object-storage 9000
docker compose -p publisher-fixture -f infra/local/compose.yml port object-storage 9001
```

Use the returned PostgreSQL address in every database URL and prefix the object
API address with `http://` for `OBJECT_STORAGE_ENDPOINT`. The console address is
for fixture inspection. Initialization continues to use the Compose service
address `http://object-storage:9000`. Do not stop another listener to free a
default port.

The clean-room CI job always requests port `0` for all three bindings and uses a
run/attempt/job-specific Compose project. Its discovery step requires each
lookup to succeed with one loopback address and a port from 1 through 65535,
then exports every consumer URL together. Fixture contract tests execute that
workflow shell with controlled Docker output, including occupied-default-port
and invalid-mapping cases. They do not prove real PostgreSQL/MinIO startup;
the clean-room CI regression and smoke results provide that separate evidence.

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
