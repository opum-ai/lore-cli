#!/usr/bin/env bash
# Run README.md's quickstart verbatim in a fresh directory (LCLI-571).
#
# The commands come from the README itself, between the quickstart:start and
# quickstart:end markers, so a retyped copy cannot drift from what readers see.
# `lore` resolves to the binary given as $1 (default: dist/lore, from
# `bun run build`); `quest` and `git` resolve from PATH.
#
# Usage: scripts/readme-quickstart.sh [path/to/lore]
# Exit: 0 when every command exits 0; otherwise the failing command's code.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
lore_bin=$(cd "$(dirname "${1:-$repo/dist/lore}")" && pwd)/$(basename "${1:-$repo/dist/lore}")
[ -x "$lore_bin" ] || { echo "readme-quickstart: no executable lore at $lore_bin" >&2; exit 2; }
command -v quest >/dev/null || { echo "readme-quickstart: quest is not on PATH" >&2; exit 2; }

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

echo "readme-quickstart: $count commands, lore $("$lore_bin" --version), quest $(quest --version)"
cd "$work/repo"
# Unset the actor variables so the README's own `export` line is what supplies them:
# a developer with them already exported must not pass where a reader would fail.
env -u LORE_QUEST_ACTOR -u LORE_QUEST_ACTOR_KIND -u LORE_QUEST_ACCOUNTABLE_HUMAN \
  PATH="$work/bin:$PATH" GIT_CONFIG_GLOBAL=/dev/null \
  GIT_AUTHOR_NAME=quickstart GIT_AUTHOR_EMAIL=quickstart@example.invalid \
  GIT_COMMITTER_NAME=quickstart GIT_COMMITTER_EMAIL=quickstart@example.invalid \
  bash -euxo pipefail -c "$snippet"
echo "readme-quickstart: all $count commands exited 0"
