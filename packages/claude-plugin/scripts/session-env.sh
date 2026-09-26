#!/usr/bin/env sh
# PLUG-001: plugin userConfig values reach hook processes only, so this
# SessionStart hook exports them into CLAUDE_ENV_FILE, which Claude Code
# sources before every Bash command. Values are single-quoted for any POSIX
# shell; nothing is printed; missing values write nothing. Each SessionStart
# appends two more lines; the last export wins when the file is sourced, so
# a changed setting takes effect without truncating other hooks' variables.
# A write failure surfaces sh's own error (path only, never the values) and
# exits 1.
set -eu
[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0
origin="${CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN:-}"
token="${CLAUDE_PLUGIN_OPTION_API_TOKEN:-}"
if [ -z "$origin" ] || [ -z "$token" ]; then exit 0; fi
newline='
'
carriage="$(printf '\r')"
case "$origin$token" in
  *"$newline"* | *"$carriage"*) exit 0 ;;
esac
squote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}
{
  printf 'export PUBLISHER_ADMIN_ORIGIN=%s\n' "$(squote "${origin%/}")"
  printf 'export PUBLISHER_API_TOKEN=%s\n' "$(squote "$token")"
} >>"$CLAUDE_ENV_FILE"
