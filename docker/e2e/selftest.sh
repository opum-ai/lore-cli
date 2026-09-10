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

printf '== step_declared_kind: manifest-vs-emission, neither side a literal ==\n'
# Driven with a stub `lore` on PATH so the helper can be exercised with no real binary. The stub
# answers `--json help` with a tiny manifest and `probe` with an envelope, which is enough to prove
# the comparison discriminates in every direction that matters.
_stub_dir="$(mktemp -d)"
cat > "$_stub_dir/lore" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "--json" ] && [ "$2" = "help" ]; then
  printf '{"data":{"commands":[{"name":"good","kind":"good.result"},{"name":"nokind","kind":null}]}}'
  exit 0
fi
exit 0
STUB
chmod +x "$_stub_dir/lore"
PATH="$_stub_dir:$PATH"

expect pass "accepts an emission matching the declared kind" \
  -- step_declared_kind good -- printf '{"kind":"good.result"}'
expect fail "REJECTS an emission that differs from the declared kind" \
  -- step_declared_kind good -- printf '{"kind":"good.WRONG"}'
expect fail "REJECTS a non-zero exit even when the kind matches" \
  -- step_declared_kind good -- bash -c 'printf "{\"kind\":\"good.result\"}"; exit 3'
expect fail "REJECTS output that is not JSON" \
  -- step_declared_kind good -- printf 'not json'
# The vacuity case: a command the manifest declares NO kind for must FAIL, not pass by comparing
# an empty emission against an empty declaration -- otherwise one missing declaration would make
# every such command pass at once, which is the defect this helper exists to catch.
expect fail "REJECTS a command the manifest declares no kind for (null declaration)" \
  -- step_declared_kind nokind -- printf '{"kind":""}'
expect fail "REJECTS a command absent from the manifest entirely" \
  -- step_declared_kind not-a-command -- printf '{"kind":"anything"}'
rm -rf "$_stub_dir"

printf '== non-vacuity: the report actually recorded every probe ==\n'
# Runs BEFORE the assert_non_vacuous probes on purpose: those inspect counters rather than
# recording a case, so counting them here would compare rows against probes that never write one.
RECORDED=$(grep -c '' "$REPORT" 2>/dev/null || echo 0)
if [ "$RECORDED" -ge "$SELF_PASS" ] && [ "$RECORDED" -gt 0 ]; then
  SELF_PASS=$((SELF_PASS + 1))
  printf '[ok]   every probe appended a report row (%s rows)\n' "$RECORDED"
else
  SELF_FAIL=$((SELF_FAIL + 1))
  printf '[BAD]  report.jsonl has %s rows -- helpers ran without recording\n' "$RECORDED" >&2
fi

printf '== assert_non_vacuous: the floor that catches a suite asserting nothing ==\n'
# This is the guard against failing GREEN, so it gets probed in both directions. The harness's
# own "$FAIL -gt 0" test cannot catch a run where nothing ran; this can, but only if it actually
# discriminates -- so prove that rather than assume it.
_probe_floor() { local p="$1" f="$2" min="$3" bp=$PASS bf=$FAIL rc
  PASS=$p; FAIL=$f; assert_non_vacuous "$min" >/dev/null 2>&1; rc=$?
  PASS=$bp; FAIL=$bf; return $rc; }
expect pass "accepts a run comfortably above the floor"    -- _probe_floor 350 0 330
expect pass "accepts a run exactly at the floor"           -- _probe_floor 330 0 330
expect pass "counts FAILures toward the total, not just PASSes -- a red suite still ran" \
  -- _probe_floor 300 30 330
expect fail "REJECTS a run one case below the floor"       -- _probe_floor 329 0 330
expect fail "REJECTS a truncated run"                      -- _probe_floor 12 0 330
expect fail "REJECTS a run where NOTHING ran -- the green-failure case"  -- _probe_floor 0 0 330

printf '\n==== harness selftest: %s ok, %s bad ====\n' "$SELF_PASS" "$SELF_FAIL"
[ "$SELF_FAIL" -eq 0 ] || exit 1
