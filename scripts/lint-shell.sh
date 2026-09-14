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
# VERSION IS NOT PINNED, AND IT ALREADY DIFFERS BETWEEN THE KEYBOARD AND CI: GitHub's ubuntu
# images ship shellcheck 0.9.0-1, while a current Homebrew install is 0.11.0. A local pass is
# therefore not a proof of a CI pass, and a runner-image bump can surface findings on an
# unrelated PR. The version is printed on every run so that is diagnosable from the log rather
# than mysterious; pin it here if it ever actually bites.
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

# `git ls-files` failing must NOT collapse into "nothing to check". Without `-e`, an
# unchecked failure here would print "no tracked .sh files" and exit 0 -- reporting success
# for an inspection that did not happen, which is exactly what this script refuses to do for
# a missing shellcheck above. Reachable outside CI: an exported tarball, a worktree with a
# broken gitdir link, a build context that excludes .git, or git absent from PATH.
#
# Read NUL-delimited into an array via a temp file rather than `$(git ls-files -z)`: bash
# STRIPS NUL bytes from command substitution, so capturing -z output into a string silently
# concatenates every path into one. The temp file also keeps git's exit status checkable,
# which a process substitution would hide.
LIST="$(mktemp)" || { echo "ERROR: mktemp failed" >&2; exit 1; }
trap 'rm -f "$LIST"' EXIT INT TERM
if ! git ls-files -z '*.sh' > "$LIST"; then
  echo "ERROR: 'git ls-files' failed, so the file list is unknown and NOTHING was checked." >&2
  echo "  Run this from inside the repository, with git on PATH." >&2
  exit 1
fi

files=()
while IFS= read -r -d '' f; do files+=("$f"); done < "$LIST"

# An empty list is an ANOMALY, not a clean result: this script is itself a tracked .sh, so
# the list can never legitimately be empty. Treating it as success would hide a broken glob.
# (Guarding here also keeps "${files[@]}" away from bash 3.2's empty-array-under-set-u abort.)
if [ "${#files[@]}" -eq 0 ]; then
  echo "ERROR: no tracked .sh files found. This script is itself tracked, so that cannot be" >&2
  echo "  right -- the file list is wrong and nothing was checked." >&2
  exit 1
fi

echo "shellcheck $(shellcheck --version | awk '/^version:/ {print $2}') over ${#files[@]} tracked .sh files"
if shellcheck -S warning "${files[@]}"; then
  echo "shell lint clean"
else
  echo "" >&2
  echo "Shell lint failed. Fix the finding, or -- if it is genuinely a false positive --" >&2
  echo "add a targeted '# shellcheck disable=SCxxxx' with a comment saying WHY." >&2
  echo "Do NOT add a blanket disable to silence a class of finding you have not read." >&2
  exit 1
fi
