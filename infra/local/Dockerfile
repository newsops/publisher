FROM alpine:3.24.3@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS fixture-base
RUN timeout 120 apk add --no-cache ca-certificates

# Local/CI fixture only. Exact official release bytes, not a production image.
FROM fixture-base AS minio-server
ARG TARGETARCH
RUN set -eu; \
    case "${TARGETARCH}" in \
      amd64) checksum=7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f ;; \
      arm64) checksum=5c83cd2cf151717ba0243f73e1c7802ff36e272b67144bdd7f1f7d684fd6f03d ;; \
      *) echo "Unsupported fixture architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    timeout 120 wget -q -T 30 -O /usr/local/bin/minio "https://github.com/minio/minio/releases/download/RELEASE.2025-09-07T16-13-09Z/minio.linux-${TARGETARCH}.RELEASE.2025-09-07T16-13-09Z"; \
    printf '%s  %s\n' "${checksum}" /usr/local/bin/minio | sha256sum -c -; \
    chmod 755 /usr/local/bin/minio; \
    mkdir -p /licenses/minio; \
    timeout 30 wget -q -T 15 -O /licenses/minio/LICENSE "https://raw.githubusercontent.com/minio/minio/07c3a429bfed433e49018cb0f78a52145d4bedeb/LICENSE"; \
    timeout 30 wget -q -T 15 -O /licenses/minio/CREDITS "https://raw.githubusercontent.com/minio/minio/07c3a429bfed433e49018cb0f78a52145d4bedeb/CREDITS"; \
    timeout 30 wget -q -T 15 -O /licenses/minio/NOTICE "https://raw.githubusercontent.com/minio/minio/07c3a429bfed433e49018cb0f78a52145d4bedeb/NOTICE"
ENTRYPOINT ["/usr/local/bin/minio"]

FROM fixture-base AS minio-client
ARG TARGETARCH
RUN set -eu; \
    case "${TARGETARCH}" in \
      amd64) checksum=01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891 ;; \
      arm64) checksum=14c8c9616cfce4636add161304353244e8de383b2e2752c0e9dad01d4c27c12c ;; \
      *) echo "Unsupported fixture architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    timeout 120 wget -q -T 30 -O /usr/local/bin/mc "https://github.com/minio/mc/releases/download/RELEASE.2025-08-13T08-35-41Z/mc.linux-${TARGETARCH}.RELEASE.2025-08-13T08-35-41Z"; \
    printf '%s  %s\n' "${checksum}" /usr/local/bin/mc | sha256sum -c -; \
    chmod 755 /usr/local/bin/mc; \
    mkdir -p /licenses/mc; \
    timeout 30 wget -q -T 15 -O /licenses/mc/LICENSE "https://raw.githubusercontent.com/minio/mc/7394ce0dd2a80935aded936b09fa12cbb3cb8096/LICENSE"; \
    timeout 30 wget -q -T 15 -O /licenses/mc/CREDITS "https://raw.githubusercontent.com/minio/mc/7394ce0dd2a80935aded936b09fa12cbb3cb8096/CREDITS"; \
    timeout 30 wget -q -T 15 -O /licenses/mc/NOTICE "https://raw.githubusercontent.com/minio/mc/7394ce0dd2a80935aded936b09fa12cbb3cb8096/NOTICE"
ENTRYPOINT ["/usr/local/bin/mc"]
