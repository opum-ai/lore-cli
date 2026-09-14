#!/usr/bin/env bash
#
# scripts/lint-shell.sh — shellcheck over every tracked .sh file (LCLI-490).
#
# WHY A SCRIPT AND NOT A BARE CI STEP: a gate only reachable in CI is one nobody runs before
# pushing. `bun run lint:shell` runs the identical command locally that CI runs, so a shell
# defect is caught at the keyboard rather than three minutes into a pipeline.
#
# SCOPE IS `git ls-files '*.sh'`, deliberately: a new shell script is covered the moment it is
# tracked, with nothing to remember to add. Untracked scratch scripts are not linted, which is
# the right default -- they are not what ships.
#
# SEVERITY IS `warning`. `info`/`style` add SC2012-class advice (prefer find over ls) that is
# noise on scripts that already read cleanly, and a gate that reports things nobody will act on
# trains people to ignore it. Raise it deliberately if that stops being true, and say why.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT" || { echo "ERROR: cannot enter $REPO_ROOT" >&2; exit 1; }

if ! command -v shellcheck >/dev/null 2>&1; then
  # FAIL, never skip. A check that silently passes when its tool is missing is worse than no
  # check: it reports success for an inspection that did not happen.
  echo "ERROR: shellcheck is not installed, so the shell lint did NOT run." >&2
  echo "  macOS: brew install shellcheck   Debian/Ubuntu: apt-get install -y shellcheck" >&2
  exit 1
fi

files="$(git ls-files '*.sh')"
if [ -z "$files" ]; then
  echo "no tracked .sh files to check"
  exit 0
fi

count="$(printf '%s\n' "$files" | wc -l | tr -d ' ')"
echo "shellcheck $(shellcheck --version | awk '/^version:/ {print $2}') over $count tracked .sh files"
# shellcheck disable=SC2086  # deliberate word splitting: paths here contain no spaces
if shellcheck -S warning $files; then
  echo "shell lint clean"
else
  echo "" >&2
  echo "Shell lint failed. Fix the finding, or -- if it is genuinely a false positive --" >&2
  echo "add a targeted '# shellcheck disable=SCxxxx' with a comment saying WHY." >&2
  echo "Do NOT add a blanket disable to silence a class of finding you have not read." >&2
  exit 1
fi
