#!/usr/bin/env bash
#
# docker/e2e/selftest.sh — proves the E2E harness's assertion helpers DISCRIMINATE (LCLI-360).
#
# The gap this closes: every case in run-e2e.sh is (helper + expectation + command). CI proved the
# cases RUN, but no one had ever observed a helper FAIL. A helper that silently stopped
# discriminating -- step_fail dropping one of its three conjuncts, say -- would turn every case
# built on it into a vacuous pass while the suite stayed green. A gate never observed failing is
# not known to work, and a green vacuous suite is the most confident possible false clear.
#
# This runs ANYWHERE: it sources lib/steps.sh, drives the helpers with `true`, `false` and `printf`
# instead of `lore`, and writes only into its own mktemp directory. No container, no lore binary,
# no mutating work -- so it runs on a developer's host as well as in CI, which is the point. The
# cases themselves still need the container; their helpers no longer do.
#
# Each assertion below states the expectation and its violation as a PAIR, because proving a helper
# passes when it should is only half the claim. The failure direction is the half that was missing.

set -uo pipefail

RESULTS_DIR="$(mktemp -d)"
REPORT="$RESULTS_DIR/report.jsonl"
export RESULTS_DIR REPORT
trap 'rm -rf "$RESULTS_DIR"' EXIT

# shellcheck source=lib/steps.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/steps.sh"

SELF_PASS=0
SELF_FAIL=0

# expect <outcome:pass|fail> <description> -- <helper invocation...>
# Runs one helper against a deliberately-correct or deliberately-violated input and asserts the
# helper's OWN verdict. The helper's PASS/FAIL counters are reset around each probe so this
# script's accounting is not polluted by the probes it runs.
expect() {
  local want="$1" desc="$2"; shift 2
  [ "${1:-}" = "--" ] && shift
  local before_pass=$PASS before_fail=$FAIL rc
  "$@" >/dev/null 2>&1
  rc=$?
  local got; [ "$rc" -eq 0 ] && got=pass || got=fail
  # Restore the harness counters: these probes are not harness cases.
  PASS=$before_pass
  FAIL=$before_fail
  if [ "$got" = "$want" ]; then
    SELF_PASS=$((SELF_PASS + 1))
    printf '[ok]   %s (helper said %s)\n' "$desc" "$got"
  else
    SELF_FAIL=$((SELF_FAIL + 1))
    printf '[BAD]  %s -- expected the helper to say %s, it said %s\n' "$desc" "$want" "$got" >&2
  fi
}

printf '== step: exit-code discrimination ==\n'
expect pass "step accepts a command whose exit matches"        -- step "probe" 0 -- true
expect fail "step REJECTS a command whose exit differs"        -- step "probe" 0 -- false
expect fail "step REJECTS a non-zero expectation that matched 0" -- step "probe" 3 -- true

printf '== step_json: exit code AND filter, both required ==\n'
expect pass "step_json accepts exit 0 with a matching filter"  -- step_json "probe" '.k == 1' -- printf '{"k":1}'
expect fail "step_json REJECTS a filter that does not match"   -- step_json "probe" '.k == 2' -- printf '{"k":1}'
expect fail "step_json REJECTS non-zero exit even when the filter would match" \
  -- step_json "probe" '.k == 1' -- bash -c 'printf "{\"k\":1}"; exit 3'
expect fail "step_json REJECTS output that is not JSON at all"  -- step_json "probe" '.k == 1' -- printf 'not json'

printf '== step_fail: THREE conjuncts, each violated independently ==\n'
# The reference case: right exit code, empty stdout, envelope matches.
expect pass "step_fail accepts exit+empty-stdout+matching-envelope" \
  -- step_fail "probe" 6 '.error_type == "validation"' -- bash -c 'printf "{\"error_type\":\"validation\"}\n" >&2; exit 6'
expect fail "step_fail REJECTS a wrong exit code (conjunct 1)" \
  -- step_fail "probe" 6 '.error_type == "validation"' -- bash -c 'printf "{\"error_type\":\"validation\"}\n" >&2; exit 3'
expect fail "step_fail REJECTS non-empty stdout (conjunct 2)" \
  -- step_fail "probe" 6 '.error_type == "validation"' -- bash -c 'echo leaked; printf "{\"error_type\":\"validation\"}\n" >&2; exit 6'
expect fail "step_fail REJECTS an envelope the filter does not match (conjunct 3)" \
  -- step_fail "probe" 6 '.error_type == "validation"' -- bash -c 'printf "{\"error_type\":\"not_found\"}\n" >&2; exit 6'
expect fail "step_fail REJECTS a stderr tail that is not JSON" \
  -- step_fail "probe" 6 '.error_type == "validation"' -- bash -c 'printf "boom\n" >&2; exit 6'
# The documented tolerance must survive: advisory warning lines BEFORE the envelope are allowed,
# because only the LAST stderr line is parsed. If this ever flips to fail, the tolerance was lost.
expect pass "step_fail still tolerates advisory stderr lines ahead of the envelope" \
  -- step_fail "probe" 6 '.error_type == "validation"' \
  -- bash -c 'printf "warning: something\n" >&2; printf "{\"error_type\":\"validation\"}\n" >&2; exit 6'

printf '== check: boolean discrimination ==\n'
expect pass "check accepts a true expression"  -- check "probe" '[ 1 = 1 ]'
expect fail "check REJECTS a false expression" -- check "probe" '[ 1 = 2 ]'

printf '== non-vacuity: the report actually recorded every probe ==\n'
RECORDED=$(grep -c '' "$REPORT" 2>/dev/null || echo 0)
if [ "$RECORDED" -ge "$SELF_PASS" ] && [ "$RECORDED" -gt 0 ]; then
  SELF_PASS=$((SELF_PASS + 1))
  printf '[ok]   every probe appended a report row (%s rows)\n' "$RECORDED"
else
  SELF_FAIL=$((SELF_FAIL + 1))
  printf '[BAD]  report.jsonl has %s rows -- helpers ran without recording\n' "$RECORDED" >&2
fi

printf '\n==== harness selftest: %s ok, %s bad ====\n' "$SELF_PASS" "$SELF_FAIL"
[ "$SELF_FAIL" -eq 0 ] || exit 1
