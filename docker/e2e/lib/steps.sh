# docker/e2e/lib/steps.sh — the assertion helpers shared by the E2E harness and its selftest.
#
# SOURCE THIS; do not execute it. Extracted from run-e2e.sh (LCLI-360) so that
# docker/e2e/selftest.sh can prove each helper DISCRIMINATES — reports FAIL when it should —
# without needing the container, a `lore` binary, or any mutating filesystem work. Before the
# extraction there was exactly one definition and no way to exercise it outside a full container
# run, so nobody had ever observed these helpers failing. A helper that silently stopped
# discriminating would turn every case built on it into a vacuous pass, and the suite would go
# green while asserting nothing.
#
# `step_fail` is the one that matters most: it asserts a CONJUNCTION (expected exit code AND empty
# stdout AND a jq filter matching the stderr ErrorEnvelope). Drop any single conjunct and a whole
# class of cases passes vacuously, with nothing in the suite to notice. The selftest violates each
# conjunct independently for exactly that reason.
#
# Contract for the sourcing script: set RESULTS_DIR and REPORT before sourcing. This file owns the
# PASS / FAIL / REPORT_WRITE_FAILURES counters and initializes them to zero.
#
# Deliberately contains NO container guard and performs NO mutating operations of its own — the
# LORE-269 fail-closed guard stays in run-e2e.sh, which is what actually runs `git init`, `lore
# init` and the rest against a real workspace. Keep it that way: adding side effects here would
# put them behind a file that the selftest sources on a developer's host.

PASS=0
FAIL=0
REPORT_WRITE_FAILURES=0

log() { printf '%s\n' "$*" >&2; }

# report_write_failed <name> — record() and check() route their append failures
# here instead of letting them pass silently: under `set -uo pipefail` (no -e)
# a failed `>>"$REPORT"` (permission denied, disk full, ...) would otherwise
# just vanish, since neither function's caller inspects its exit status. This
# still lets the run continue (the harness itself stays informative on stderr
# even if the report file is unwritable) but makes sure the failure is loud
# and reflected in the script's own final exit code (see the Phase 25 tally).
report_write_failed() {
  REPORT_WRITE_FAILURES=$((REPORT_WRITE_FAILURES + 1))
  log "REPORT WRITE FAILED: could not append '$1' to $REPORT"
}

record() {
  local name="$1" status="$2" expected="$3" actual="$4" out="$5" err="$6"
  jq -nc \
    --arg name "$name" --arg status "$status" \
    --argjson expected "$expected" --argjson actual "$actual" \
    --rawfile stdout "$out" --rawfile stderr "$err" \
    '{name:$name,status:$status,expected_exit:$expected,actual_exit:$actual,stdout:$stdout,stderr:$stderr}' \
    >>"$REPORT" || report_write_failed "$name"
}

# step <name> <expected_exit> -- <cmd...>
step() {
  local name="$1" expected="$2"
  shift 2
  [ "${1:-}" = "--" ] && shift
  local out err rc status
  out="$(mktemp)"
  err="$(mktemp)"
  "$@" >"$out" 2>"$err"
  rc=$?
  if [ "$rc" -eq "$expected" ]; then
    status=PASS
    PASS=$((PASS + 1))
  else
    status=FAIL
    FAIL=$((FAIL + 1))
  fi
  record "$name" "$status" "$expected" "$rc" "$out" "$err"
  log "[$status] $name (exit $rc, expected $expected)"
  rm -f "$out" "$err"
  [ "$status" = "PASS" ]
}

# step_json <name> <jq-filter> -- <cmd...>  -- expects exit 0 AND the filter true on stdout
step_json() {
  local name="$1" filter="$2"
  shift 2
  [ "${1:-}" = "--" ] && shift
  local out err rc status
  out="$(mktemp)"
  err="$(mktemp)"
  "$@" >"$out" 2>"$err"
  rc=$?
  if [ "$rc" -eq 0 ] && jq -e "$filter" "$out" >/dev/null 2>&1; then
    status=PASS
    PASS=$((PASS + 1))
  else
    status=FAIL
    FAIL=$((FAIL + 1))
  fi
  record "$name (jq: $filter)" "$status" 0 "$rc" "$out" "$err"
  log "[$status] $name (exit $rc, jq: $filter)"
  rm -f "$out" "$err"
  [ "$status" = "PASS" ]
}

# step_fail <name> <expected_exit> <jq-filter> -- <cmd...>
# Asserts the --json failure-output contract (cli-contract.md S5.2): the expected exit code,
# EMPTY stdout, and a jq filter over the stderr ErrorEnvelope JSON (error_type/message/hint/input).
# A command that scans the whole bundle (loadBundle) can print `warning: ...` advisory lines to
# stderr AHEAD of the envelope (unrelated to the failure under test), so the ErrorEnvelope is only
# guaranteed to be the LAST line of stderr, not the whole file -- that's what gets parsed.
step_fail() {
  local name="$1" expected="$2" filter="$3"
  shift 3
  [ "${1:-}" = "--" ] && shift
  local out err rc status envelope
  out="$(mktemp)"
  err="$(mktemp)"
  "$@" >"$out" 2>"$err"
  rc=$?
  envelope="$(tail -n1 "$err")"
  if [ "$rc" -eq "$expected" ] && [ ! -s "$out" ] && printf '%s' "$envelope" | jq -e "$filter" >/dev/null 2>&1; then
    status=PASS
    PASS=$((PASS + 1))
  else
    status=FAIL
    FAIL=$((FAIL + 1))
  fi
  record "$name (jq: $filter)" "$status" "$expected" "$rc" "$out" "$err"
  log "[$status] $name (exit $rc, stdout empty: $([ -s "$out" ] && echo no || echo yes), jq: $filter)"
  rm -f "$out" "$err"
  [ "$status" = "PASS" ]
}

# check <name> <bash-boolean-expression-string> -- a plain assertion, not a subprocess-under-test
check() {
  local name="$1" expr="$2" status
  if eval "$expr"; then
    status=PASS
    PASS=$((PASS + 1))
  else
    status=FAIL
    FAIL=$((FAIL + 1))
  fi
  jq -nc --arg name "$name" --arg status "$status" '{name:$name,status:$status}' >>"$REPORT" \
    || report_write_failed "$name"
  log "[$status] $name"
  [ "$status" = "PASS" ]
}

tally() {
  log ""
  log "==== E2E summary: $PASS passed, $FAIL failed (report: $REPORT) ===="
  if [ "$REPORT_WRITE_FAILURES" -gt 0 ]; then
    log "==== WARNING: $REPORT_WRITE_FAILURES report write(s) to $REPORT failed (see REPORT WRITE FAILED lines above) ===="
  fi
}

# assert_non_vacuous <min-expected-cases> -- returns non-zero when too few cases ran.
#
# A suite that runs FEWER cases than it should is the most dangerous way this harness can fail,
# because it fails GREEN: a "$FAIL -gt 0" test is false when nothing ran, so a run that died
# early, skipped a phase, or lost its assertions exits 0 and reads as a clean sheet. That is not
# hypothetical -- when lib/steps.sh was missing from the image every helper became "command not
# found" and nothing was recorded (LCLI-360).
#
# Lives here rather than inline in run-e2e.sh specifically so selftest.sh can prove it
# discriminates without a container. A guard that cannot be tested is a guard nobody has seen work.
# step_declared_kind <command-name> -- <cmd...>
#
# Asserts the envelope a command actually EMITS carries the kind the manifest DECLARES for it,
# with both sides read from the same running binary at check time (LCLI-365).
#
# The gap this closes: the harness already asserted `.kind == "orphans.report"` against real output,
# and a unit test separately asserted the manifest says "orphans.report". Two independent literals,
# each correct, with no edge between them -- a handler could change and both literals be updated
# while the manifest went stale, and nothing would fail. Neither side here is a literal: the
# declared kind comes out of `lore --json help`, the emitted kind out of the command's own envelope.
# That is CLAUDE.md's "bind on content, re-derive at check time" applied to the manifest contract.
#
# Fails when the manifest declares NO kind for the named command, rather than treating an empty
# expectation as satisfied -- an absent declaration is the exact defect worth catching, and a
# comparison against "" would pass vacuously for every command at once.
step_declared_kind() {
  local command_name="$1"
  shift
  [ "${1:-}" = "--" ] && shift
  local out err rc status declared emitted
  out="$(mktemp)"
  err="$(mktemp)"
  declared="$(lore --json help 2>/dev/null | jq -r --arg n "$command_name" \
    '.data.commands[] | select(.name == $n) | .kind' 2>/dev/null)"
  "$@" >"$out" 2>"$err"
  rc=$?
  emitted="$(jq -r '.kind // empty' "$out" 2>/dev/null)"
  if [ -n "$declared" ] && [ "$declared" != "null" ] && [ "$rc" -eq 0 ] && [ "$emitted" = "$declared" ]; then
    status=PASS
    PASS=$((PASS + 1))
  else
    status=FAIL
    FAIL=$((FAIL + 1))
  fi
  record "$command_name: emitted kind matches the manifest-declared kind (declared='$declared' emitted='$emitted')" \
    "$status" 0 "$rc" "$out" "$err"
  log "[$status] $command_name emitted='$emitted' declared='$declared'"
  rm -f "$out" "$err"
  [ "$status" = "PASS" ]
}

assert_non_vacuous() {
  local min="$1" total=$((PASS + FAIL))
  if [ "$total" -lt "$min" ]; then
    log ""
    log "==== NON-VACUITY FAILURE: only $total cases ran, expected at least $min ===="
    log "The suite did not assert what it claims to. Do NOT lower the floor to clear this."
    log "Find the phase that stopped early, the assertions that stopped being defined, or the"
    log "deletion that removed them."
    return 1
  fi
  return 0
}

critical() {
  if ! step "$@"; then
    log ""
    log "CRITICAL bootstrap step failed: $1 -- aborting the remaining phases"
    tally
    exit 1
  fi
}
