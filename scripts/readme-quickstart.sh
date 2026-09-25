#!/usr/bin/env bash
# Run README.md's quickstart verbatim in a fresh directory (LCLI-571), then check
# its example transcripts against real output from that repository (LCLI-588).
#
# The commands come from the README itself, between the quickstart:start and
# quickstart:end markers, so a retyped copy cannot drift from what readers see.
# Each fenced block right after a `<!-- quickstart:example -->` marker is a
# transcript: a `$ <command>` line, then the output the README promises. The
# command runs in the finished quickstart repository and must exit 0; its stdout
# must equal the rest of the block, compared as parsed JSON (key order ignored)
# when the command passes --json and byte for byte otherwise.
# `lore` resolves to the binary given as $1 (default: dist/lore, from
# `bun run build`); `quest` and `git` resolve from PATH.
#
# Usage: scripts/readme-quickstart.sh [path/to/lore]
# Exit: 0 when every command exits 0 and every example matches; 1 on an example
# mismatch; 2 on a bad README or environment; otherwise the failing command's code.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
lore_bin=$(cd "$(dirname "${1:-$repo/dist/lore}")" && pwd)/$(basename "${1:-$repo/dist/lore}")
[ -x "$lore_bin" ] || { echo "readme-quickstart: no executable lore at $lore_bin" >&2; exit 2; }
command -v quest >/dev/null || { echo "readme-quickstart: quest is not on PATH" >&2; exit 2; }
command -v jq >/dev/null || { echo "readme-quickstart: jq is not on PATH" >&2; exit 2; }

snippet=$(awk '/<!-- quickstart:start -->/{on=1; next} /<!-- quickstart:end -->/{on=0} on' "$repo/README.md" \
  | sed -e '/^```/d')
# Fail rather than pass on an empty extraction: a moved marker must not read as a clean run.
# The floor is the current count: dropping a command from the quickstart should be a
# deliberate edit here too, not something the gate absorbs.
count=$(printf '%s\n' "$snippet" | grep -cE '^(lore|quest|git|export) ' || true)
[ "$count" -ge 14 ] || { echo "readme-quickstart: extracted only $count commands from README.md (expected >= 14)" >&2; exit 2; }
# `set -e` does not stop on a failure inside an && / || list, so a README line using one
# could fail and still pass here. Refuse the construct rather than trust it.
if printf '%s\n' "$snippet" | grep -v '^[[:space:]]*#' | grep -qE '&&|\|\|'; then
  echo "readme-quickstart: the quickstart uses && or ||, which hides failures from set -e" >&2; exit 2
fi

work=$(mktemp -d)
trap 'chmod -R u+w "$work" 2>/dev/null; rm -rf "$work" || true' EXIT
mkdir -p "$work/bin" "$work/repo"
ln -s "$lore_bin" "$work/bin/lore"

# Split each marked example block into its own file: line 1 is `$ <command>`, the rest
# is the expected output. A marker not followed by a fence is a README error, not a skip.
mkdir -p "$work/examples"
examples=$(awk -v dir="$work/examples" '
  /<!-- quickstart:example -->/ { armed = 1; next }
  armed && !inblock && /^```/ { inblock = 1; n++; f = dir "/" n; next }
  armed && !inblock && !/^[[:space:]]*$/ { print "marker on line " NR - 1 " is not followed by a fenced block" > "/dev/stderr"; bad = 1; exit }
  inblock && /^```/ { close(f); inblock = 0; armed = 0; next }
  inblock { print > f }
  END { if (bad || inblock) exit 1; print n + 0 }
' "$repo/README.md") || { echo "readme-quickstart: malformed quickstart:example block in README.md" >&2; exit 2; }
# Same floor logic as the quickstart: losing a marker must not read as a clean run.
[ "$examples" -ge 2 ] || { echo "readme-quickstart: found only $examples marked examples in README.md (expected >= 2)" >&2; exit 2; }
for i in $(seq 1 "$examples"); do
  head -1 "$work/examples/$i" | grep -q '^\$ ' \
    || { echo "readme-quickstart: example $i does not start with a '\$ <command>' line" >&2; exit 2; }
done

# Unset the actor variables so the README's own `export` line is what supplies them:
# a developer with them already exported must not pass where a reader would fail.
in_repo() {
  env -u LORE_QUEST_ACTOR -u LORE_QUEST_ACTOR_KIND -u LORE_QUEST_ACCOUNTABLE_HUMAN \
    PATH="$work/bin:$PATH" GIT_CONFIG_GLOBAL=/dev/null \
    GIT_AUTHOR_NAME=quickstart GIT_AUTHOR_EMAIL=quickstart@example.invalid \
    GIT_COMMITTER_NAME=quickstart GIT_COMMITTER_EMAIL=quickstart@example.invalid \
    "$@"
}

echo "readme-quickstart: $count commands, $examples examples, lore $("$lore_bin" --version), quest $(quest --version)"
cd "$work/repo"
in_repo bash -euxo pipefail -c "$snippet"
echo "readme-quickstart: all $count commands exited 0"

failed=0
for i in $(seq 1 "$examples"); do
  block="$work/examples/$i"
  cmd=$(head -1 "$block" | sed 's/^\$ //')
  tail -n +2 "$block" > "$block.expected"
  echo "readme-quickstart: example $i: $cmd"
  in_repo bash -euo pipefail -c "$cmd" > "$block.actual" || {
    echo "readme-quickstart: example $i exited $? (expected 0): $cmd" >&2; failed=1; continue; }
  case " $cmd " in
    *" --json "*)
      jq -S . "$block.expected" > "$block.expected.norm" \
        || { echo "readme-quickstart: example $i: the README's output is not valid JSON" >&2; failed=1; continue; }
      jq -S . "$block.actual" > "$block.actual.norm" \
        || { echo "readme-quickstart: example $i: the command's output is not valid JSON" >&2; failed=1; continue; }
      diff -u --label README --label actual "$block.expected.norm" "$block.actual.norm" >&2 \
        || { echo "readme-quickstart: example $i differs from real output (JSON, key order ignored): $cmd" >&2; failed=1; } ;;
    *)
      diff -u --label README --label actual "$block.expected" "$block.actual" >&2 \
        || { echo "readme-quickstart: example $i differs from real output (byte for byte): $cmd" >&2; failed=1; } ;;
  esac
done
[ "$failed" -eq 0 ] || exit 1
echo "readme-quickstart: all $examples examples match real output"
