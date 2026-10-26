#!/usr/bin/env bash
# Reads the Quest CLI version CLAUDE.md declares, for CI (DEC-240 item 3, LCLI-768).
#
# The version is read ONLY from inside the managed Quest block's markers, and must be an exact
# X.Y.Z (^[0-9]+\.[0-9]+\.[0-9]+$). Anything else fails by name and never reaches `npm install` as a
# range, a tag or a partial version: the reader that used to live inline in four workflow steps took
# the first `Quest CLI <digits and dots>` line anywhere in the file, so a stray sentence outside the
# block, or `0.14` for `0.14.1`, installed something other than the pinned peer.
#
# Usage: scripts/read-declared-quest-version.sh [CLAUDE.md]
# Writes `version=X.Y.Z` to $GITHUB_OUTPUT (stdout when it is unset, for a local run). Every
# diagnostic is a `::error file=...::` workflow command on stdout, so a failed read is named in the
# job summary rather than surfacing later as an npm error about a range.
set -euo pipefail

file="${1:-CLAUDE.md}"
begin='<!-- quest:agent-instructions:begin -->'
end='<!-- quest:agent-instructions:end -->'

fail() {
  printf '::error file=%s::%s\n' "$file" "$1"
  exit 1
}

[ -f "$file" ] || fail "cannot read the declared Quest version: $file does not exist."

# The markers must be exactly one begin line and one end line, begin first. An unclosed block would
# read to the end of the file, a duplicated one hides which block the version came from, and reversed
# markers bound nothing, so each fails by name rather than being read leniently.
normalised="$(tr -d '\r' < "$file")"
begins="$(printf '%s\n' "$normalised" | grep -cxF -- "$begin" || true)"
ends="$(printf '%s\n' "$normalised" | grep -cxF -- "$end" || true)"
if [ "$begins" -ne 1 ] || [ "$ends" -ne 1 ]; then
  fail "$file must contain exactly one '$begin' line and one '$end' line, found $begins begin and $ends end, so the declared Quest version is not read."
fi
begin_line="$(printf '%s\n' "$normalised" | grep -nxF -- "$begin" | cut -d: -f1)"
end_line="$(printf '%s\n' "$normalised" | grep -nxF -- "$end" | cut -d: -f1)"
[ "$begin_line" -lt "$end_line" ] || fail "the managed Quest block markers in $file are reversed (end on line $end_line, begin on line $begin_line), so the declared Quest version is not read."

# Only the bytes between the markers.
block="$(printf '%s\n' "$normalised" | awk -v b="$begin" -v e="$end" '$0 == b { inside = 1; next } $0 == e { inside = 0 } inside')"
[ -n "$block" ] || fail "the managed Quest block ($begin ... $end) in $file is empty, so the declared Quest version cannot be read. The version is read only from inside those markers."

# The word after `Quest CLI `, up to whitespace. A partial version ('0.14'), a range ('^0.14.1'), a
# pre-release ('0.14.1-rc.1') or trailing punctuation all survive this step intact so the check below
# can name them.
declared="$(printf '%s\n' "$block" | grep -o 'Quest CLI [^[:space:]]*' | head -n 1 | sed 's/^Quest CLI //' || true)"
[ -n "$declared" ] || fail "the managed Quest block in $file has no 'Quest CLI <version>' line, so the declared Quest version cannot be read."

if ! [[ "$declared" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # Printable, bounded: the value is file content and is echoed into a workflow command.
  shown="$(printf '%s' "$declared" | tr -cd '[:print:]' | cut -c1-40)"
  fail "the managed Quest block in $file declares Quest CLI '$shown', which is not an exact X.Y.Z (^[0-9]+\\.[0-9]+\\.[0-9]+\$). Refusing to hand it to npm as a range or a partial version."
fi

echo "Declared Quest version: $declared"
echo "version=$declared" >> "${GITHUB_OUTPUT:-/dev/stdout}"
