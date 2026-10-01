#!/usr/bin/env bash
#
# Run a CI gate command whose output can contain repository content, with that output kept
# out of the runner's workflow-command parser (LCLI-661).
#
# WHY THIS EXISTS. The runner parses a step's stdout AND stderr as workflow commands, so any
# line a command prints that begins with `::` or `##[` is EXECUTED. Tracker record text is
# session-written and arbitrary, and this repository's own records demonstrate the hazard: a
# note quoting a CI log line -- `.quest/completed/LCLI-507.json` carries
# `##[error]Process completed with exit code 1.` -- streamed out of the bare
# `quest task list --json` step and forged a real failure annotation on a job that was green
# (Tracker integrity, check-run 110060733763, 2026-09-30). The same mechanism would honour
# `::add-mask::`, `::stop-commands::` or `::warning::` from any record, document or CHANGELOG
# a gate command echoes.
#
# WHAT IT DOES. The command runs with both streams captured to files, so nothing it prints is
# parsed while it runs. The captured text is then replayed between `::stop-commands::` markers,
# the runner's own mechanism for logging untrusted content: every line stays visible in the
# log and none of it can execute. The exit status is the command's own, unchanged, so gates
# that go through it gate exactly as they did before.
#
# Usage: ci-quiet-gate.sh <command> [args...]
# Exit:  the command's own exit status; 2 = usage error
set -uo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $(basename "$0") <command> [args...]" >&2
  exit 2
fi

stdout_file="$(mktemp)"
stderr_file="$(mktemp)"
trap 'rm -f "${stdout_file}" "${stderr_file}"' EXIT

status=0
"$@" >"${stdout_file}" 2>"${stderr_file}" || status=$?

# Replay one captured stream, ending it on its own line. A stream whose last byte is not a
# newline would otherwise GLUE to the next echo: the resume marker lands mid-line, the runner
# never sees it as a command, and the stop block stays open for the rest of the step, so the
# guard's own failure annotation would be silently swallowed (review F2, measured byte-level).
replay_file() {
  [[ -s "$1" ]] || return 0
  cat "$1"
  if [[ "$(tail -c 1 "$1" | od -An -tx1 | tr -d ' \n')" != "0a" ]]; then
    echo
  fi
}

# A fresh token per run: replay is safe unless the captured text contains the exact resume
# marker, and nothing durable can contain 32 random hex characters.
token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
echo "::stop-commands::${token}"
replay_file "${stdout_file}"
if [[ -s "${stderr_file}" ]]; then
  echo "--- stderr ---"
  replay_file "${stderr_file}"
fi
echo "::${token}::"

if [[ "${status}" -ne 0 ]]; then
  echo "::error::${1} exited ${status}"
fi
exit "${status}"
