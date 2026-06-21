#!/bin/bash
# _common.sh — shared prelude sourced by all ECK hooks that use jq.
# Not a hook itself; not registered in settings.json.
#
# Provides:
#   - jq presence check that exits 2 if missing (loud fail, not silent approve)
#   - _sha256: portable SHA-256 hex (sha256sum on Linux/Git Bash, shasum on macOS)
#   - _normalize_path: convert backslashes to forward slashes for cross-platform
#     pattern matching on Claude Code's tool_input.file_path
#
# See issues: #36 (jq silent failure), #37 (shasum portability), #38 (path bypass).

if ! command -v jq >/dev/null 2>&1; then
  echo "ECK hook error: jq not found on PATH." >&2
  echo "All ECK hooks require jq to parse Claude Code input." >&2
  echo "Install: 'winget install jqlang.jq' on Windows, 'brew install jq' on macOS, or https://jqlang.github.io/jq/" >&2
  exit 2
fi

_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | head -c 8
  else
    shasum -a 256 | head -c 8
  fi
}

_normalize_path() {
  printf '%s' "$1" | tr '\\' '/'
}
