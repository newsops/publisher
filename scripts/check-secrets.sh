#!/usr/bin/env sh
# Last gate before a push: refuse a tree that carries a committed credential.
#
# `.agents/rules/fail-loud.md` — a check that cannot establish its contract
# must exit non-zero. An earlier version ran `rg` as an `if` condition, so on a
# machine without ripgrep the condition was merely false and this script
# reported a clean tree without reading a single file. Ripgrep is now optional,
# POSIX `grep` is the fallback, and having neither is a failure.
#
# Matches are reported as `path:line` only: the pattern that matched is a
# credential, and printing it would copy it into terminal scrollback and CI
# logs.
set -eu

# The key alternative allows an optional algorithm word before PRIVATE, which
# is where the real headers put it. The previous alternative listed the
# algorithms *instead of* that word, so it matched only the unqualified header
# and missed every `ssh-keygen` and OpenSSL key. The test covers all four.
PATTERN='(BEGIN ([A-Z0-9]+ )*PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})'

if command -v rg >/dev/null 2>&1; then
  found=$(
    rg -n --hidden \
      --glob '!node_modules/**' \
      --glob '!.git/**' \
      --glob '!.next/**' \
      --glob '!out/**' \
      --glob '!dist/**' \
      --glob '!pnpm-lock.yaml' \
      "$PATTERN" . || true
  )
elif command -v grep >/dev/null 2>&1; then
  found=$(
    grep -rnIE \
      --exclude-dir=node_modules \
      --exclude-dir=.git \
      --exclude-dir=.next \
      --exclude-dir=out \
      --exclude-dir=dist \
      --exclude=pnpm-lock.yaml \
      "$PATTERN" . || true
  )
else
  echo '[secrets] neither ripgrep nor grep is available; refusing to pass without scanning' >&2
  exit 2
fi

if [ -n "$found" ]; then
  printf '%s\n' "$found" | cut -d: -f1,2 | sort -u >&2
  echo '[secrets] possible secret found' >&2
  exit 1
fi

echo '[secrets] no known committed-secret pattern found'
