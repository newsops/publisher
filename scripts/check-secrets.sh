#!/usr/bin/env sh
set -eu

if rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!.next/**' --glob '!pnpm-lock.yaml' '(BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})' .; then
  echo '[secrets] possible secret found' >&2
  exit 1
fi

echo '[secrets] no known committed-secret pattern found'
