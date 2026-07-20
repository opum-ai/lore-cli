#!/usr/bin/env bash
#
# docker/e2e/run-e2e.sh — the E2E test driver for LORE-56.
#
# Exercises the full `lore` command surface against a REAL, --json-capable
# `backlog` binary (built from the MrLesk/Backlog.md pinned commit — see
# docker/e2e/Dockerfile) and a real, mutating scratch backlog project. No
# mocked adapter anywhere (ADR-0002's JSON-only/fail-loud mandate). Every
# step's real stdout/stderr/exit code is appended to $RESULTS_DIR/report.jsonl
# as one JSON line. A non-critical step failing does not abort the run; the
# script's own exit code reflects the overall tally.
#
# Two steps below used to deliberately assert CURRENT (buggy) behavior as a
# regression baseline before their bugs were fixed (LORE-57, LORE-59); both
# now assert the correct exit code.

set -uo pipefail

RESULTS_DIR="${RESULTS_DIR:-/results}"
REPORT="$RESULTS_DIR/report.jsonl"
LORE_REPO="${LORE_REPO:-/opt/lore}"
BROKEN_FIXTURES="$LORE_REPO/test/fixtures/okf-bundle/broken"

mkdir -p "$RESULTS_DIR"
: > "$REPORT"

PASS=0
FAIL=0

log() { printf '%s\n' "$*" >&2; }

record() {
  local name="$1" status="$2" expected="$3" actual="$4" out="$5" err="$6"
  jq -n \
    --arg name "$name" --arg status "$status" \
    --argjson expected "$expected" --argjson actual "$actual" \
    --rawfile stdout "$out" --rawfile stderr "$err" \
    '{name:$name,status:$status,expected_exit:$expected,actual_exit:$actual,stdout:$stdout,stderr:$stderr}' \
    >>"$REPORT"
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
  jq -n --arg name "$name" --arg status "$status" '{name:$name,status:$status}' >>"$REPORT"
  log "[$status] $name"
  [ "$status" = "PASS" ]
}

tally() {
  log ""
  log "==== E2E summary: $PASS passed, $FAIL failed (report: $REPORT) ===="
}

critical() {
  if ! step "$@"; then
    log ""
    log "CRITICAL bootstrap step failed: $1 -- aborting the remaining phases"
    tally
    exit 1
  fi
}

cd /workspace

# ── Phase 0a: binary preflight (no project needed yet) ──────────────────────
step "lore --version prints a real version" 0 -- lore --version
step "lore --help prints the banner" 0 -- bash -c 'lore --help | grep -q "OKF-native documentation CLI"'
check "backlog --version prints a real (non-0.0.0) version" 'v="$(backlog --version)"; [ -n "$v" ] && [ "$v" != "0.0.0" ]'

# ── Phase 1: bootstrap (critical — nothing downstream works without this) ───
critical "git init" 0 -- git init -q
git config user.email "e2e@lore.test"
git config user.name "lore e2e"
critical "backlog init" 0 -- backlog init "lore-e2e" --defaults
# Mirror this repo's own backlog/config.yml contract (ADR-0012): lore must be
# the sole committer of backlog/.
backlog config set autoCommit false >/dev/null
backlog config set remoteOperations false >/dev/null
backlog config set checkActiveBranches false >/dev/null
critical "lore init" 0 -- lore init
# `lore init` itself creates the (empty) .lore/cache/ directory as part of
# scaffolding — its mere existence isn't evidence of a cached probe result.
check "no stale probe result in .lore/cache/ before the first real probe" \
  '[ -z "$(ls -A .lore/cache 2>/dev/null)" ]'

# ── Phase 2: seed real backlog tasks ─────────────────────────────────────────
TASK1="$(backlog task create "Design the archive endpoint" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
TASK2="$(backlog task create "Implement the archive job" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
TASK3="$(backlog task create "Write archive docs" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
log "seeded tasks: $TASK1 $TASK2 $TASK3"
check "seeded 3 real backlog tasks" '[ -n "$TASK1" ] && [ -n "$TASK2" ] && [ -n "$TASK3" ]'

# ── Phase 3: lore new, once per built-in type ────────────────────────────────
declare -A DOC_PATH DOC_ID
for T in Epic Story Spec ADR Runbook Reference; do
  DOC_PATH[$T]=""
  DOC_ID[$T]=""
done
for T in Epic Story Spec ADR Runbook Reference; do
  OUT="$(lore new "$T" "E2E sample $T" --json 2>/tmp/new-err)"
  RC=$?
  check "lore new $T succeeds" "[ $RC -eq 0 ]"
  if [ "$RC" -eq 0 ]; then
    DOC_PATH[$T]="$(echo "$OUT" | jq -r '.data.path')"
    DOC_ID[$T]="$(echo "$OUT" | jq -r '.data.id')"
  fi
done
STORY_PATH="${DOC_PATH[Story]}"
STORY_ID="${DOC_ID[Story]}"

# ── Phase 4: link / unlink, + lore sync rendering the managed block ─────────
# LORE-57 (fixed): the doc: back-ref write to Backlog used to fail (editTask
# sent --json to `backlog task edit`, which doesn't support it). Now it
# succeeds — verify both the frontmatter tasks: list AND the real backRef.
# Frontmatter stores lowercased ids (task-1) even though Backlog's CLI
# displays/creates them uppercased (TASK-1) — case-insensitive match.
step_json "lore link writes the doc: back-ref (LORE-57 fixed)" \
  '.data.tasks | all(.backRef == "added" or .backRef == "already-present")' \
  -- lore link "$STORY_ID" "$TASK1" "$TASK2" --json
check "lore link also wrote the frontmatter tasks: list" \
  'grep -qi "$TASK1" "$STORY_PATH" && grep -qi "$TASK2" "$STORY_PATH"'
# unlink now has a real backref to remove (link's write above succeeded).
step_json "lore unlink removes the real backref" \
  '.data.tasks[] | select(.task == "'"$TASK2"'") | .backRef == "removed"' \
  -- lore unlink "$STORY_ID" "$TASK2" --json
step_json "lore link: re-add TASK2 for downstream phases" \
  '.data.tasks[] | select(.task == "'"$TASK2"'") | .backRef == "added"' \
  -- lore link "$STORY_ID" "$TASK2" --json

# LORE-59 (fixed): `lore new Story` now scaffolds the managed block, so
# `lore sync` renders the Story's linked tasks into it directly — no
# hand-authored markup step needed between `lore new` and `lore sync`.
step "lore sync renders the managed block for newly-linked tasks (LORE-59 fixed)" 0 \
  -- lore sync "$STORY_ID"
check "lore sync rendered the linked tasks' table into the managed block" \
  'grep -q "lore:tasks:begin" "$STORY_PATH" && grep -q "| Task | Title | Status |" "$STORY_PATH"'

# ── Phase 3b (here, not earlier): capability probe negative tests. These need
# a concept that actually has linked tasks — `lore tasks` on an empty tasks:
# list returns an empty rollup without ever shelling out to backlog at all
# (confirmed), so hiding backlog from PATH would silently no-op the test.
#
# LORE-60 (doc-accuracy, fixed): ADR-0002 used to say a missing/too-old/incapable
# backlog binary all map to exit 6 (validation). The real, deliberate code
# (src/adapters/backlog.ts probeBacklog, its own comment: "a missing binary
# (ENOENT) is not_found (exit 3) ... distinct from a present-but-incapable
# binary (exit 6)") intentionally splits these: entirely MISSING is exit 3.
# The code's distinction is reasonable; ADR-0002 and this runbook now match it.
mkdir -p /tmp/no-backlog-path
for b in /usr/local/bin/*; do
  bn="$(basename "$b")"
  [ "$bn" = "backlog" ] && continue
  ln -sf "$b" "/tmp/no-backlog-path/$bn"
done
# RUNBOOK_HINT (src/adapters/backlog.ts) is the one documented install hint for a missing
# backlog binary; assert its stable distinguishing substring survives onto stderr, not just
# the bare error_type/exit code.
step_fail "capability probe: lore fails loud (exit 3, not_found) with no backlog on PATH" 3 \
  '.error_type == "not_found" and (.hint | contains("backlog-json-patch.md"))' \
  -- env PATH=/tmp/no-backlog-path lore tasks "$STORY_ID" --json
# Populate .lore/cache/ with one real, successful probe, then re-check with
# backlog hidden again. Exploratory: log the real outcome either way.
lore tasks "$STORY_ID" --json >/dev/null 2>&1 || true
step_fail "capability probe: stale-cache case (cached-good probe, backlog now hidden)" 3 \
  '.error_type == "not_found" and (.hint | contains("backlog-json-patch.md"))' \
  -- env PATH=/tmp/no-backlog-path lore tasks "$STORY_ID" --json

# ── Phase 3c: capability probe, PRESENT-but-incapable branch (LORE-62 AC3) ──────────────────
# The negative tests above only ever exercise the MISSING-binary half of probeBacklog's split
# (exit 3). The present-but-incapable half (exit 6, validation) never runs in this harness,
# because the image ships only the capable pinned build. Two PATH-shadowed stub `backlog`
# scripts cover both variants src/adapters/backlog.ts's probeBacklog distinguishes: a version
# below MIN_BACKLOG_VERSION ("1.47.1"), and a version-capable binary whose `task list --json`
# still fails to parse. No cross-process probe cache exists today (capability is memoized only
# inside one in-process BacklogAdapter; each `lore` invocation below is a fresh process), so
# each `env PATH=...` call below reliably re-runs the probe from scratch.
for d in /tmp/stub-backlog-old-version /tmp/stub-backlog-not-json-capable; do
  mkdir -p "$d"
  for b in /usr/local/bin/*; do
    bn="$(basename "$b")"
    [ "$bn" = "backlog" ] && continue
    ln -sf "$b" "$d/$bn"
  done
done
cat >/tmp/stub-backlog-old-version/backlog <<'STUB'
#!/bin/sh
echo "1.40.0"
STUB
chmod +x /tmp/stub-backlog-old-version/backlog
cat >/tmp/stub-backlog-not-json-capable/backlog <<'STUB'
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "1.47.1"
else
  echo "not json, plain stock output"
fi
STUB
chmod +x /tmp/stub-backlog-not-json-capable/backlog

step_fail "capability probe: version below the 1.47.1 floor drives validation (exit 6), not not_found" 6 \
  '.error_type == "validation" and (.hint | contains("backlog-json-patch.md"))' \
  -- env PATH=/tmp/stub-backlog-old-version lore tasks "$STORY_ID" --json
step_fail "capability probe: version-capable but not --json-capable drives validation (exit 6)" 6 \
  '.error_type == "validation" and (.hint | contains("backlog-json-patch.md"))' \
  -- env PATH=/tmp/stub-backlog-not-json-capable lore tasks "$STORY_ID" --json

# ── Phase 5: live task rollup ────────────────────────────────────────────────
step_json "lore tasks --json (live rollup)" '.kind == "tasks.rollup" and (.data.tasks | length) >= 1' \
  -- lore tasks "$STORY_ID" --json

# ── Phase 5b: missing-task raw signatures + lore-level consequences (LORE-62 AC1/AC2) ───────
# A bogus id must still be SYNTACTICALLY valid (same <prefix>-<number> shape as a real id, e.g.
# "task-1") or Backlog's CLI may reject it as malformed input rather than a genuine not-found —
# a different failure mode than the one under test. Derive one from a real captured id's own
# prefix instead of hardcoding a guess.
BOGUS_TASK_ID="${TASK1%-*}-99999"

# AC1: pin the pinned binary's OWN two missing-task signatures directly (no lore involved) —
# the raw contracts src/adapters/backlog.ts's viewTask/editTask rest on.
check "raw binary: task view of a nonexistent id exits 1 with empty stdout" \
  'out="$(backlog task view "$BOGUS_TASK_ID" --json 2>/dev/null)"; rc=$?; [ "$rc" -eq 1 ] && [ -z "$out" ]'
check "raw binary: task edit of a nonexistent id reports not-found on stderr" \
  'err="$(backlog task edit "$BOGUS_TASK_ID" --status "In Progress" 2>&1 >/dev/null)"; rc=$?; [ "$rc" -ne 0 ] && printf "%s" "$err" | grep -qi "not found"'

# AC2a: `lore link` validates every task id BEFORE any write — a bogus id fails loud
# (not_found/exit 3) and the concept's frontmatter never gets touched.
SPEC_PATH="${DOC_PATH[Spec]}"
SPEC_ID="${DOC_ID[Spec]}"
step_fail "lore link: a nonexistent task id fails before any write (not_found, exit 3)" 3 \
  '.error_type == "not_found"' \
  -- lore link "$SPEC_ID" "$BOGUS_TASK_ID" --json
check "lore link's failed validation left the Spec's frontmatter untouched" \
  '! grep -qi "$BOGUS_TASK_ID" "$SPEC_PATH"'

# AC2b/c: a linked task VANISHING from Backlog (its file moved aside, simulating upstream
# forgetting it) — sync fails loud (exit 3, EMPTY stdout: gatherReconciliation is awaited
# before sync's own emit() ever runs, src/commands/sync.ts). `check` ALSO exits 3, but its
# stdout is NOT empty: check.ts emits its check.report BEFORE rethrowing the reconciliation
# error (src/commands/check.ts, confirmed by test/check.test.ts's own "the already-computed
# report is still emitted when reconciliation rejects" regression test) — a real asymmetry
# step_fail's blanket "empty stdout" assumption does not cover, so this uses a bespoke check
# rather than step_fail (LORE-61's own lesson: verify every exit-code assumption against
# source/tests before encoding it, don't trust a filing task's technique at face value).
TASK5="$(backlog task create "E2E task to vanish" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "seeded TASK5 to vanish" '[ -n "$TASK5" ]'
# Backlog's own frontmatter/error-message representation of a task id is lowercased even
# though the CLI displays/creates it uppercased (the "TASK-1" vs. "task-1" distinction noted
# in Phase 4 above) — a `.message | contains(...)` check needs the lowercase form.
TASK5_LC="$(printf '%s' "$TASK5" | tr 'A-Z' 'a-z')"
step_json "lore link: attach TASK5 to the Spec (for the vanishing test)" \
  '.data.tasks[] | select(.task == "'"$TASK5"'") | .status == "added"' \
  -- lore link "$SPEC_ID" "$TASK5" --json
TASK5_FILE=""
[ -n "$TASK5" ] && TASK5_FILE="$(find backlog/tasks -iname "${TASK5} - *.md" | head -1)"
check "found TASK5's backlog file on disk" '[ -n "${TASK5_FILE:-}" ] && [ -f "$TASK5_FILE" ]'
mv "$TASK5_FILE" /tmp/vanished-task5.md

step_fail "lore sync: a vanished linked task fails loud (not_found, exit 3, empty stdout)" 3 \
  '.error_type == "not_found" and (.message | contains("'"$TASK5_LC"'"))' \
  -- lore sync "$SPEC_ID" --json

lore check docs/specs --json >/tmp/check-vanish-out 2>/tmp/check-vanish-err
CHECK_VANISH_RC=$?
check "lore check: a vanished linked task ALSO exits 3, but (unlike sync) still emits its check.report on stdout first" \
  '[ "$CHECK_VANISH_RC" -eq 3 ] \
   && jq -e ".kind == \"check.report\"" /tmp/check-vanish-out >/dev/null 2>&1 \
   && tail -n1 /tmp/check-vanish-err | jq -e ".error_type == \"not_found\" and (.message | contains(\"$TASK5_LC\"))" >/dev/null 2>&1'
rm -f /tmp/check-vanish-out /tmp/check-vanish-err

# AC2d: `lore tasks` SOFT-drops the dangling id instead of failing: exit 0, the id absent
# from the rollup, a stderr warning naming it.
step "lore tasks: soft-drops a dangling linked id (exit 0)" 0 -- lore tasks "$SPEC_ID" --json
lore tasks "$SPEC_ID" --json >/tmp/tasks-vanish-out 2>/tmp/tasks-vanish-err
check "lore tasks: dangling id dropped from the rollup, with a stderr warning naming it" \
  '! (jq -e ".data.tasks[]? | select(.id == \"$TASK5\")" /tmp/tasks-vanish-out >/dev/null 2>&1) \
   && grep -qi "$TASK5" /tmp/tasks-vanish-err'
rm -f /tmp/tasks-vanish-out /tmp/tasks-vanish-err

# Restore state so later phases see a clean, unlinked Spec again.
mv /tmp/vanished-task5.md "$TASK5_FILE"
step_json "lore unlink: detach TASK5 from the Spec (restore state)" \
  '.data.tasks[] | select(.task == "'"$TASK5"'") | .backRef == "removed"' \
  -- lore unlink "$SPEC_ID" "$TASK5" --json

# ── Phase 6: mutate real backlog status, then sync ──────────────────────────
backlog task edit "$TASK1" --status "In Progress" >/dev/null 2>&1
backlog task edit "$TASK2" --status "Done" >/dev/null 2>&1
# LORE-63 AC1: filesChanged >= 1 is asserted here (not just backlogCommit.committed, which the
# harness's own dirty backlog/ files can satisfy even when sync writes nothing new in docs/) --
# without it, Phase 7's idempotency check (filesChanged == 0) is trivially satisfiable regardless
# of whether THIS sync actually did anything.
step_json "lore sync --json reflects a real backlog mutation + commits backlog/" \
  '.kind == "sync.result" and .data.backlogCommit.committed == true and (.data.filesChanged >= 1)' \
  -- lore sync --json
check "git log shows the lore-authored backlog/ commit" '[ "$(git log --oneline | wc -l | tr -d " ")" -gt 0 ]'
# LORE-63 AC1: value-assert the rendered managed-block rows against concrete status literals --
# check's clean-bundle gates alone only prove sync wrote something SELF-CONSISTENT, never that the
# reconciled rows match real data, so a wrong-but-stable status would otherwise pass silently.
# Anchored on "[$TASKn]" (the row's markdown link text, `managed-block.ts`'s `renderRow`) rather
# than a bare `grep -i "$TASKn"`: the id also appears, differently-cased and bracket-free, in the
# frontmatter `tasks:` list (one id per line, `link.ts`'s lowercased form) -- an unanchored match
# would silently accept a hit on that unrelated line, and would also prefix-collide once any task
# id reaches double digits (e.g. "TASK-1" inside "TASK-10"). The closing `]` rules both out.
check "managed block renders TASK1's live status (In Progress), not just structural markers" \
  'grep -F -- "[$TASK1]" "$STORY_PATH" | grep -q "In Progress"'
check "managed block renders TASK2's live status (Done)" \
  'grep -F -- "[$TASK2]" "$STORY_PATH" | grep -q "Done"'

# ── Phase 7: idempotency ─────────────────────────────────────────────────────
step_json "lore sync --json idempotent rerun (no-op)" \
  '.data.filesChanged == 0 and .data.backlogCommit.committed == false' -- lore sync --json
# lore only ever commits backlog/ (ADR-0012) — docs/, .lore/, and AGENTS.md
# stay untracked forever unless a human/CI stages them separately, so scope
# the "clean" check to the tree lore actually owns.
check "git status clean under backlog/ after an idempotent sync" \
  '[ -z "$(git status --porcelain -- backlog/)" ]'

# ── Phase 8: validate ────────────────────────────────────────────────────────
step_json "lore validate: clean bundle" '.kind == "validate.report"' -- lore validate --json
cp "$BROKEN_FIXTURES/missing-type.md" docs/reference/e2e-broken-missing-type.md
step "lore validate: catches a missing type: (documented hard error)" 6 \
  -- lore validate docs/reference/e2e-broken-missing-type.md
rm -f docs/reference/e2e-broken-missing-type.md

# ── Phase 9: check — the drift-gate loop ─────────────────────────────────────
# `check`'s positional args are bundle DIRECTORIES to scope to, not individual
# file paths ("check validates the whole bundle" — confirmed via its own
# usage-error hint text); `sync` takes a concept id, same as phase 4 above.
step "lore check: clean bundle" 0 -- lore check
cp "$BROKEN_FIXTURES/dangling-link.md" docs/reference/e2e-broken-dangling-link.md
step "lore check: catches a dangling link" 6 -- lore check docs/reference
rm -f docs/reference/e2e-broken-dangling-link.md
step "lore check: clean again once the broken doc is removed" 0 -- lore check

# Genuine Story-status drift, healed by `lore sync` (the documented loop).
sed -i 's/^status: .*/status: bogus-drifted-status/' "$STORY_PATH" || true
step "lore check: catches real Story status drift" 6 -- lore check docs/stories
step "lore sync: heals the drift" 0 -- lore sync "$STORY_ID"
step "lore check: clean again after healing" 0 -- lore check docs/stories

# LORE-63 AC2: managed-BLOCK BODY drift -- the other half of check's drift detection, never
# exercised before now (the only induction above is a frontmatter sed). Corrupt a rendered status
# cell directly: "In Progress" (capital, TASK1's live Backlog status) only ever appears inside the
# block's own row, never in the (lowercased) frontmatter `status:` value, so this touches only the
# block body, not the frontmatter drift check just healed above.
sed -i 's/In Progress/CORRUPTED-STATUS/' "$STORY_PATH" || true
step "lore check: catches managed-block BODY drift (distinct from frontmatter status drift)" 6 \
  -- lore check docs/stories
step "lore sync: heals the managed-block body drift" 0 -- lore sync "$STORY_ID"
step "lore check: clean again after healing the block-body drift" 0 -- lore check docs/stories

# ── Phase 10: orphans ────────────────────────────────────────────────────────
# Per orphans.ts's documented scope: ANY doc: label exempts a task from being
# reported, even one pointing at a nonexistent concept (that mismatch is
# `lore check`'s job, not orphans'). A genuine orphanTasks case needs a task
# with NO doc: label and no owning tasks: reference at all — TASK3 (seeded in
# phase 2) has never been linked to anything, so it qualifies as-is.
step_json "lore orphans: reports TASK3 (seeded, never linked to any doc)" \
  '.kind == "orphans.report" and (.data.orphanTasks // [] | length) >= 1' -- lore orphans --json
step "lore orphans --tasks-only runs cleanly" 0 -- lore orphans --tasks-only
check "lore orphans surfaces the never-linked TASK3" \
  'lore orphans --json 2>/dev/null | grep -qi "$TASK3"'

# ── Phase 11: graph ───────────────────────────────────────────────────────────
step_json "lore graph (whole bundle, --json)" '.kind == "graph.export"' -- lore graph --json
step_json "lore graph <id>" '.kind == "graph.export"' -- lore graph "$STORY_ID" --json
step "lore graph --dot" 0 -- lore graph --dot

# ── Phase 12: query ───────────────────────────────────────────────────────────
step_json "lore query full-text" '.kind == "query.results"' -- lore query "archive" --json
step_json "lore query --type filter" '.kind == "query.results"' -- lore query --type Story --json

# ── Phase 13: context ─────────────────────────────────────────────────────────
step_json "lore context --max-tokens" '.kind == "context.export"' \
  -- lore context "$STORY_ID" --max-tokens 2000 --json

# ── Phase 14: replace ─────────────────────────────────────────────────────────
BEFORE_MARKERS="$(grep -c "lore:tasks" "$STORY_PATH")"
step_json "lore replace outside managed regions" '.kind == "replace.result"' \
  -- lore replace "archive orders" "archive Orders" --json
AFTER_MARKERS="$(grep -c "lore:tasks" "$STORY_PATH")"
check "managed region untouched by replace" "[ $BEFORE_MARKERS -eq $AFTER_MARKERS ]"

# ── Phase 15: rename ───────────────────────────────────────────────────────────
OLD_REF_ID="${DOC_ID[Reference]}"
OLD_REF_PATH="${DOC_PATH[Reference]}"
step_json "lore rename --dry-run (reports, moves nothing)" '.kind == "rename.result"' \
  -- lore rename "$OLD_REF_ID" "reference/e2e-renamed" --dry-run --json
check "dry-run rename did not move the file" '[ -f "$OLD_REF_PATH" ]'
step_json "lore rename (real move + inbound link repoint)" '.kind == "rename.result"' \
  -- lore rename "$OLD_REF_ID" "reference/e2e-renamed" --json
check "renamed file exists at the new path" '[ -f "docs/reference/e2e-renamed.md" ]'
check "old path no longer exists" '[ ! -f "$OLD_REF_PATH" ]'

# ── Phase 15b: LINKED-concept rename exercises Backlog coupling + F1 (LORE-62 AC4) ──────────
# Phase 15 above only ever renames the unlinked Reference doc (no `tasks:` at all), so
# moveBackRefs (the real `task edit` label/--doc move), rename's per-write backlog commit, and
# its unique F1 failure asymmetry have never actually run. Rename the STORY instead — the one
# linked concept (TASK1 + TASK2 so far).
NEW_STORY_ID_1="stories/e2e-renamed-story"
NEW_STORY_PATH_1="docs/stories/e2e-renamed-story.md"
step_json "lore rename (LINKED concept, real moveBackRefs + backlog commit)" \
  '.kind == "rename.result" and (.data.backRefs | length) >= 1 and (.data.backRefs | all(.backRef == "moved" or .backRef == "already-current")) and .data.backlogCommit.committed == true' \
  -- lore rename "$STORY_ID" "$NEW_STORY_ID_1" --json
STORY_ID="$NEW_STORY_ID_1"
STORY_PATH="$NEW_STORY_PATH_1"
check "renamed Story's back-reference really moved on the real task record (not just the report)" \
  'backlog task view "$TASK1" --json | jq -e --arg p "$STORY_PATH" ".task.documentation | index(\$p) != null" >/dev/null 2>&1'
check "git status clean under backlog/ after the linked rename's own commit" \
  '[ -z "$(git status --porcelain -- backlog/)" ]'

# F1 asymmetry: induce a back-ref write failure during a SECOND rename of the same linked
# Story, mirroring LORE-58/61's chmod-induction pattern against every linked task's file.
TASK1_FILE="$(find backlog/tasks -iname "${TASK1} - *.md" | head -1)"
TASK2_FILE="$(find backlog/tasks -iname "${TASK2} - *.md" | head -1)"
check "found TASK1/TASK2 backlog files for the F1 induction" '[ -n "$TASK1_FILE" ] && [ -n "$TASK2_FILE" ]'
chmod 444 "$TASK1_FILE" "$TASK2_FILE"
chmod 555 backlog/tasks
NEW_STORY_ID_2="stories/e2e-renamed-story-f1"
lore rename "$STORY_ID" "$NEW_STORY_ID_2" --json >/tmp/rename-f1-out 2>/tmp/rename-f1-err
RENAME_F1_RC=$?
chmod 755 backlog/tasks
chmod 644 "$TASK1_FILE" "$TASK2_FILE"
# Note: stderr is NOT asserted empty here — every bundle-loading command (rename included)
# unconditionally flushes routine "skipping non-concept index.md" advisories to stderr
# (WarningCollector), so a nonempty stderr means nothing on its own. The real F1 signature —
# distinguishing a RETURN from link/unlink's THROW — is that rename.result (success-shaped
# report data) still appears on stdout at all, despite the nonzero exit.
check "F1 asymmetry: rename fails by RETURN (exit 6), not throw — rename.result STILL on stdout" \
  '[ "$RENAME_F1_RC" -eq 6 ] \
   && jq -e ".kind == \"rename.result\" and (.data.backRefs | any(.backRef == \"failed\"))" /tmp/rename-f1-out >/dev/null 2>&1'
check "the file STILL moved despite the induced back-ref failure (file move commits first)" \
  '[ -f "docs/stories/e2e-renamed-story-f1.md" ] && [ ! -f "docs/stories/e2e-renamed-story.md" ]'
STORY_ID="$NEW_STORY_ID_2"
STORY_PATH="docs/stories/e2e-renamed-story-f1.md"
rm -f /tmp/rename-f1-out /tmp/rename-f1-err

# ── Phase 15c: custom status flows + .lore/config.toml overrides (LORE-63 AC3/AC4) ──────────
# Every reconciliation test above only ever runs against the three DEFAULT statuses seeded by
# `backlog init` (the hardcoded-defaults trap LORE-26 exists to prevent). Backlog.md has no CLI to
# set `statuses:` directly -- `backlog config set statuses '[...]'` refuses on the real binary,
# invoked directly against the pinned CLI: "statuses cannot be set directly... Edit the list in the
# project config file... directly" (exit 1; `--help` alone only shows `statuses` absent from the
# documented settable-key list, it does not print this message) -- so a custom flow is authored the
# same way any real team would: a direct edit to backlog/config.yml's own `statuses:` key, in the
# exact flow-array shape `backlog init` itself writes (verified against a real `backlog init` run:
# `statuses: ["To Do", "In Progress", "Done"]`).
#
# A FRESH Story, linked to exactly one task, isolates the reconciled rollup to that one task's
# status -- the existing $STORY_ID already carries other linked tasks (TASK1/TASK2/TASK4), whose
# own active/terminal classification would otherwise mask whatever Review's classification
# contributes. Only Story ships the `<!-- lore:tasks -->` managed block by default (LORE-59;
# Spec/ADR/etc. do not), so the isolated probe must itself be a Story.
cp backlog/config.yml /tmp/config-yml-original.yml
sed -i 's|^statuses:.*$|statuses: ["To Do", "In Progress", "Review", "Done"]|' backlog/config.yml || true
check "backlog/config.yml now carries a custom, non-default 4-entry status flow" \
  'grep -q "Review" backlog/config.yml'

CUSTOM_STORY_OUT="$(lore new Story "E2E custom status story" --json 2>/tmp/custom-story-err)"
CUSTOM_STORY_RC=$?
check "lore new Story (custom-status-flow probe) succeeds" '[ "$CUSTOM_STORY_RC" -eq 0 ]'
CUSTOM_STORY_ID=""
CUSTOM_STORY_PATH=""
if [ "$CUSTOM_STORY_RC" -eq 0 ]; then
  CUSTOM_STORY_ID="$(echo "$CUSTOM_STORY_OUT" | jq -r '.data.id')"
  CUSTOM_STORY_PATH="$(echo "$CUSTOM_STORY_OUT" | jq -r '.data.path')"
fi

TASK6="$(backlog task create "E2E custom-status-flow task" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "seeded TASK6 for the custom-status-flow probe" '[ -n "$TASK6" ]'
step "backlog task edit: set TASK6 to the new custom status Review (validated against backlog/config.yml)" 0 \
  -- backlog task edit "$TASK6" --status "Review"
step_json "lore link: attach TASK6 (status Review) to the fresh Story" \
  '.data.tasks[] | select(.task == "'"$TASK6"'") | .status == "added"' \
  -- lore link "$CUSTOM_STORY_ID" "$TASK6" --json
step_json "lore sync: a non-default status (Review) flows through reconciliation end-to-end" \
  '.kind == "sync.result"' -- lore sync "$CUSTOM_STORY_ID" --json
check "Story status reconciled to in-progress via the custom flow (Review is active, non-terminal)" \
  'grep -q "^status: in-progress" "$CUSTOM_STORY_PATH"'
# Anchored on "[$TASK6]" (the row's link text) for the same reason as the Phase 6 checks above --
# a bare `grep -i "$TASK6"` would also hit the frontmatter `tasks:` line.
check "managed block renders the live custom status Review, not a default-flow guess" \
  'grep -F -- "[$TASK6]" "$CUSTOM_STORY_PATH" | grep -q "Review"'

# parseStatusFlow's validation-6 fail-loud branch (src/adapters/backlog.ts:841-877): a malformed
# `statuses:` shape (not a list of strings) must fail loud rather than silently falling back to the
# hardcoded defaults.
cp backlog/config.yml /tmp/config-yml-good-flow.yml
sed -i 's|^statuses:.*$|statuses: "not-a-list"|' backlog/config.yml || true
step_fail "exit 6: malformed backlog/config.yml statuses: (not a list of strings) fails loud" 6 \
  '.error_type == "validation"' \
  -- lore sync "$CUSTOM_STORY_ID" --json
cp /tmp/config-yml-good-flow.yml backlog/config.yml
rm -f /tmp/config-yml-good-flow.yml

# LORE-63 AC4: the .lore/config.toml [reconcile.overrides] surface -- documented as the recovery
# path for a status an ordered flow cannot classify unambiguously -- has never run either. This
# Story links only TASK6, so overriding Review -> done flips the WHOLE rollup from in-progress
# (flow position, just asserted above) to done (override) -- a passing check can only mean the
# override was actually read and honored, not coincidence.
cat > .lore/config.toml <<'TOMLEOF'
[reconcile.overrides]
Review = "done"
TOMLEOF
step_json "lore sync: [reconcile.overrides] Review->done takes precedence over flow position" \
  '.kind == "sync.result"' -- lore sync "$CUSTOM_STORY_ID" --json
check "Story status flips to done via the override (proves overrides win over flow position)" \
  'grep -q "^status: done" "$CUSTOM_STORY_PATH"'

# A malformed override target (not one of todo/in-progress/done) is core/reconcile.ts's OWN
# validation (validateOverrides), distinct from a bare TOML syntax error -- fails loud the same way.
cat > .lore/config.toml <<'TOMLEOF'
[reconcile.overrides]
Review = "not-a-real-status"
TOMLEOF
step_fail "exit 6: [reconcile.overrides] target must be a valid rollup status (validation)" 6 \
  '.error_type == "validation"' \
  -- lore sync "$CUSTOM_STORY_ID" --json
rm -f .lore/config.toml

# Leave no induced state behind: the probe Story's on-disk status still reads "done" from the
# override test above, which no longer matches TASK6's real "Review" status now that no override
# is active -- re-heal it against live data, then restore backlog/config.yml's original status
# flow so this phase's custom flow does not silently outlive it.
step "lore sync: re-heal the probe Story back to live data now the override is gone" 0 \
  -- lore sync "$CUSTOM_STORY_ID"
check "probe Story re-healed to in-progress (Review's flow-position classification, no override)" \
  'grep -q "^status: in-progress" "$CUSTOM_STORY_PATH"'
cp /tmp/config-yml-original.yml backlog/config.yml
rm -f /tmp/config-yml-original.yml

# ── Phase 16: supersede ────────────────────────────────────────────────────────
SUCCESSOR="$(lore new ADR "E2E successor decision" --json | jq -r '.data.id')"
step_json "lore supersede --dry-run" '.kind == "supersede.result"' \
  -- lore supersede "${DOC_ID[ADR]}" "$SUCCESSOR" --dry-run --json
step_json "lore supersede (real, rewrite-links)" '.kind == "supersede.result"' \
  -- lore supersede "${DOC_ID[ADR]}" "$SUCCESSOR" --rewrite-links --json

# ── Phase 17: schema export ─────────────────────────────────────────────────────
step_json "lore schema export" '.kind == "schema.result"' -- lore schema export --json
for T in epic story spec adr runbook reference; do
  check "schema export produced valid JSON for $T" "jq -e . .lore/schemas/${T}.schema.json >/dev/null 2>&1"
done

# ── Phase 17b: declarative profile subsystem (LORE-64) ──────────────────────────
# LORE-46's populated-profile path (a real .lore/profile.toml declaring a custom type) has
# never run in this harness -- only the zero-config default (Phase 3/17's six built-in types).
# Grammar re-derived directly from src/core/profile.ts + scaffold.ts's own DEFAULT_PROFILE_TOML
# scaffold comment (not the filing task's description), confirmed by test/profile.test.ts's
# working fixture: `fields = { ... }` is a plain inline table on the `[[types]]` entry itself.
#
# Confirmed by reading commands/new.ts/core/template.ts: `lore new` can NEVER satisfy a
# profile-declared custom REQUIRED field -- buildNewConcept's frontmatter only ever carries
# type/title/summary/timestamp/tags(+stamped resource); `--var` only fills BODY placeholders,
# there is no `--field key=value` flag. So AC1 (lore new succeeds + custom template) and AC2 (a
# required field fails validate) reuse ONE custom type across a MUTATED profile file, exactly
# like Phase 15c/16 mutated backlog/config.yml / .lore/config.toml in place: declare the type
# with no required fields first (AC1 succeeds), then add a required field to the same
# already-written doc and validate it directly (AC2) rather than via `lore new`.
mkdir -p .lore/templates
cat > .lore/templates/e2e-custom-type.md <<'TPLEOF'
# {{title}}

LORE64-CUSTOM-TEMPLATE-MARKER

## Rationale
TPLEOF

cat > .lore/profile.toml <<'TOMLEOF'
[profile]
name = "e2e-custom-profile"
okf_version = "0.1"

[base.fields]
type = { required = true }
title = {}
summary = {}
timestamp = { kind = "datetime" }

[[types]]
name = "E2E Custom Type"
template = "e2e-custom-type.md"
TOMLEOF

# AC1: a populated profile's custom type + custom template is exercised E2E.
CUSTOM_OUT="$(lore new "E2E Custom Type" "E2E custom type doc" --json 2>/tmp/custom-new-err)"
CUSTOM_RC=$?
check "AC1: lore new succeeds for a populated-profile custom type" "[ $CUSTOM_RC -eq 0 ]"
CUSTOM_PATH=""
if [ "$CUSTOM_RC" -eq 0 ]; then
  CUSTOM_PATH="$(echo "$CUSTOM_OUT" | jq -r '.data.path')"
fi
check "AC1: custom type's file landed under its LOWER-KEBAB slug directory" \
  '[ -f "docs/e2e-custom-type/e2e-custom-type-doc.md" ] && [ "$CUSTOM_PATH" = "docs/e2e-custom-type/e2e-custom-type-doc.md" ]'
check "AC1: body rendered from the custom .lore/templates/ file, not the generic fallback" \
  'grep -q "LORE64-CUSTOM-TEMPLATE-MARKER" "$CUSTOM_PATH" && ! grep -q "Describe this" "$CUSTOM_PATH"'

# AC2: add a profile-declared REQUIRED field to the same type -- the existing doc (created
# before the field existed) now fails `lore validate`; adding the field makes it pass. This is
# the realistic workflow (a team adds a required field to an existing type), and the only way to
# exercise a required custom field at all, since `lore new` can never stamp one (see above).
cat > .lore/profile.toml <<'TOMLEOF'
[profile]
name = "e2e-custom-profile"
okf_version = "0.1"

[base.fields]
type = { required = true }
title = {}
summary = {}
timestamp = { kind = "datetime" }

[[types]]
name = "E2E Custom Type"
template = "e2e-custom-type.md"
fields = { owner = { required = true } }
TOMLEOF

step "AC2: lore validate fails (exit 6) once the type gains a required field the doc lacks" 6 \
  -- lore validate "$CUSTOM_PATH"
sed -i '/^timestamp:/a owner: jeremy' "$CUSTOM_PATH"
step "AC2: lore validate passes once the required custom field is present" 0 \
  -- lore validate "$CUSTOM_PATH"

# AC3: lore schema export emits the custom-slug schema file (profile still v2, owner required).
step_json "AC3: lore schema export (populated profile)" '.kind == "schema.result"' \
  -- lore schema export --json
check "AC3: schema export produced the custom type's schema (slug e2e-custom-type)" \
  'jq -e . .lore/schemas/e2e-custom-type.schema.json >/dev/null 2>&1'
check "AC3: the custom schema's required list includes the declared field" \
  'jq -e ".required | index(\"owner\")" .lore/schemas/e2e-custom-type.schema.json >/dev/null 2>&1'

# AC4: a malformed profile (here: [profile]/[base.fields] populated but zero [[types]] --
# profile.ts's own documented fail-loud case, "the common cause is uncommenting [profile]/
# [base.fields] but leaving the example [[types]] commented") makes every loadProfile-bearing
# command fail loud at exit 6, validation. `lore check` is confirmed by source (check.ts imports
# nothing from core/profile.ts) to NOT load the profile at all. Proven by COMPARING its outcome
# before/after the malformed profile is introduced (not by asserting a bare "exit 0", which a
# real docker run showed is the WRONG test: this harness's bundle already carries an unrelated,
# pre-existing `lore check` finding by this point in the script -- see LORE-68, filed separately,
# not this task's scope) -- identical findings both times is the actual, robust proof of
# profile-invariance, independent of whatever the bundle's own baseline state is.
lore check --json >/tmp/check-baseline.json 2>/dev/null
BASELINE_CHECK_RC=$?

cp .lore/profile.toml /tmp/profile-toml-good.toml
cat > .lore/profile.toml <<'TOMLEOF'
[profile]
name = "e2e-custom-profile"
okf_version = "0.1"

[base.fields]
type = { required = true }
TOMLEOF

step_fail "AC4: exit 6 malformed profile (zero [[types]]) via lore new" 6 \
  '.error_type == "validation"' \
  -- lore new "E2E Custom Type" "should fail under malformed profile" --json
step_fail "AC4: exit 6 malformed profile (zero [[types]]) via lore validate" 6 \
  '.error_type == "validation"' \
  -- lore validate "$CUSTOM_PATH" --json
step_fail "AC4: exit 6 malformed profile (zero [[types]]) via lore sync" 6 \
  '.error_type == "validation"' \
  -- lore sync "$STORY_ID" --json

lore check --json >/tmp/check-malformed.json 2>/dev/null
MALFORMED_CHECK_RC=$?
check "AC4: lore check is NOT profile-bearing -- byte-identical outcome with a malformed profile" \
  '[ "$MALFORMED_CHECK_RC" -eq "$BASELINE_CHECK_RC" ] && diff -q /tmp/check-baseline.json /tmp/check-malformed.json >/dev/null'
rm -f /tmp/check-baseline.json /tmp/check-malformed.json

cp /tmp/profile-toml-good.toml .lore/profile.toml
rm -f /tmp/profile-toml-good.toml /tmp/custom-new-err
step_json "profile restored: lore schema export succeeds again (loadProfile recovers)" \
  '.kind == "schema.result"' -- lore schema export --json

# Leave no induced state behind (LORE-63's convention): a custom profile.toml REPLACES the
# default six-type vocabulary wholesale, and a full `lore schema export` PRUNES any
# *.schema.json whose type the active profile no longer declares -- so both schema exports
# above already pruned Phase 17's six default schema files. Deleting the custom profile and
# re-exporting once more (now back on the zero-config default) regenerates the six defaults
# AND prunes the orphaned custom one in the same step, leaving Phase 18+ the bundle state they
# already expect.
rm -f .lore/profile.toml .lore/templates/e2e-custom-type.md
step_json "profile removed: lore schema export regenerates the six default schemas" \
  '.kind == "schema.result"' -- lore schema export --json
check "the orphaned custom schema was pruned on the default-profile re-export" \
  '[ ! -f .lore/schemas/e2e-custom-type.schema.json ]'
for T in epic story spec adr runbook reference; do
  check "default schema for $T restored after the profile subsystem probe" \
    "jq -e . .lore/schemas/${T}.schema.json >/dev/null 2>&1"
done

# ── Phase 18: scaffold mkdocs + a real build ────────────────────────────────────
step "lore scaffold mkdocs" 0 -- lore scaffold mkdocs
step "mkdocs build (real)" 0 -- mkdocs build --site-dir /tmp/mkdocs-site
check "mkdocs produced index.html" '[ -f /tmp/mkdocs-site/index.html ]'

# ── Phase 19: scaffold docusaurus + a real build ────────────────────────────────
step "lore scaffold docusaurus" 0 -- lore scaffold docusaurus
step "docusaurus npm install (real)" 0 -- bash -c 'cd website && npm install'
step "docusaurus npm run build (real)" 0 -- bash -c 'cd website && npm run build'
check "docusaurus produced build/index.html" '[ -f website/build/index.html ]'

# ── Phase 20: scaffold obsidian ─────────────────────────────────────────────────
step "lore scaffold obsidian" 0 -- lore scaffold obsidian
check "obsidian app.json has the expected keys" \
  'jq -e "has(\"useMarkdownLinks\") and has(\"newLinkFormat\") and has(\"alwaysUpdateLinks\")" docs/.obsidian/app.json >/dev/null 2>&1'

# ── Phase 21: instructions ───────────────────────────────────────────────────────
step_json "lore instructions (overview)" '.kind == "instructions.text"' -- lore instructions --json
step_json "lore instructions <topic>" '.kind == "instructions.text"' -- lore instructions linking --json

# ── Phase 22: agents ─────────────────────────────────────────────────────────────
step_json "lore agents" '.kind == "agents.result"' -- lore agents --json
check "SKILL.md regenerated" '[ -f .claude/skills/lore/SKILL.md ]'

# ── Phase 23: help ────────────────────────────────────────────────────────────────
step_json "lore help --json (capability manifest)" '.kind == "help.manifest"' -- lore help --json
check "help manifest mentions sync and check" \
  'lore help --json | grep -qi "\"sync\"" && lore help --json | grep -qi "\"check\""'

# ── Phase 24: exit-code + output-mode spot checks ────────────────────────────────
# Every exit-class check below now asserts the --json failure-output contract
# (cli-contract.md S5.2/S5.3), not just the bare exit code (LORE-61): stdout stays EMPTY
# and the stderr ErrorEnvelope's error_type matches the documented family.
step_fail "exit 2: usage error (bad flag)" 2 '.error_type == "usage"' \
  -- lore new --nope --json
step_fail "exit 3: not_found" 3 '.error_type == "not_found"' \
  -- lore tasks stories/does-not-exist-at-all --json
cp "$STORY_PATH" /tmp/perm-test.md
chmod 000 "$STORY_PATH"
step_fail "exit 4: denied (real EACCES on a doc lore must read)" 4 '.error_type == "denied"' \
  -- lore validate "$STORY_PATH" --json
chmod 644 "$STORY_PATH"
cp /tmp/perm-test.md "$STORY_PATH"
step_fail "exit 5: conflict (duplicate lore new)" 5 '.error_type == "conflict"' \
  -- lore new Epic "E2E sample Epic" --json
# `lore validate` (like `lore check`) is a GATE (ADR-0007): a per-file finding reports as
# ordinary `validate.report` DATA on stdout with a nonzero exit -- NEVER the stderr
# ErrorEnvelope -- confirmed against the real binary (src/commands/validate.ts returns
# EXIT_CODES.validation as a plain return value, it never throws). Keep this gate contract
# covered on stdout (stronger than the old bare-exit-code check).
cp "$BROKEN_FIXTURES/missing-type.md" docs/reference/e2e-exit6-check.md
lore validate docs/reference/e2e-exit6-check.md --json >/tmp/validate-gate-out 2>/tmp/validate-gate-err
VALIDATE_GATE_RC=$?
check "exit 6: lore validate gate reports the finding as report data on stdout, not an ErrorEnvelope" \
  '[ "$VALIDATE_GATE_RC" -eq 6 ] && [ ! -s /tmp/validate-gate-err ] && jq -e ".kind == \"validate.report\" and .data.errorCount >= 1" /tmp/validate-gate-out >/dev/null 2>&1'
rm -f docs/reference/e2e-exit6-check.md /tmp/validate-gate-out /tmp/validate-gate-err

# A genuine error_type=validation ErrorEnvelope (cli-contract.md S5.3) needs a failure thrown
# BEFORE any gate report is built: a malformed .lore/config.toml, which `lore sync` reads and
# validates up front and fails loud on (src/config.ts loadConfig) -- unlike validate/check,
# which fold a config problem into their own report instead of throwing.
printf 'key = "unterminated\n' > .lore/config.toml
step_fail "exit 6: validation (error_type=validation ErrorEnvelope, distinct from drift)" 6 \
  '.error_type == "validation"' \
  -- lore sync "$STORY_ID" --json
rm -f .lore/config.toml

# exit 6: drift half of the distinction above (LORE-58 induced back-ref write failure,
# incl. LORE-61 AC3). A real backlog/ write failure during link/unlink routes through
# the SAME exit-6 family as validation but a DISTINCT error_type ("drift"), carrying the
# per-task report in .input instead of the old success-shaped stdout envelope (LORE-58's
# own fix, src/commands/link.ts backRefFailure()) — proving this exit-6 step's name
# ("distinct from drift") is actually true, not just asserted in prose.
TASK4="$(backlog task create "E2E induced write-failure task" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "seeded TASK4 for the induced write-failure probe" '[ -n "$TASK4" ]'
# Guard the find pattern on a non-empty id: an empty $TASK4 would otherwise degrade to
# `-iname "*.md"` and silently resolve to some OTHER (wrong) task file below. The
# " - " separator (Backlog's own `saveTask` naming: "<id> - <title>.md") anchors the
# match past the id so e.g. TASK-4 can never prefix-match a TASK-40's file.
TASK4_FILE=""
[ -n "$TASK4" ] && TASK4_FILE="$(find backlog/tasks -iname "${TASK4} - *.md" | head -1)"
check "found TASK4's backlog file on disk" '[ -n "${TASK4_FILE:-}" ] && [ -f "$TASK4_FILE" ]'

# Strip write permission on both the file itself (blocks an in-place overwrite of an
# existing file, governed by the file's own bits) and its containing directory (blocks any
# temp-file+rename write strategy, governed by the directory's bits) so the induced failure
# holds regardless of which write strategy the pinned `backlog` binary uses internally.
chmod 444 "$TASK4_FILE"
chmod 555 backlog/tasks
step_fail "exit 6: drift (LORE-58 induced link write failure, distinct from validation)" 6 \
  '.error_type == "drift" and (.input.tasks[]? | select(.task == "'"$TASK4"'") | .backRef == "failed")' \
  -- lore link "$STORY_ID" "$TASK4" --json
chmod 755 backlog/tasks
chmod 644 "$TASK4_FILE"

# Give TASK4 a real backref (perms restored) so the unlink induction below has something
# real to remove — LORE-58's fix and this AC cover both link and unlink symmetrically.
step_json "lore link: give TASK4 a real backref (for the unlink induction below)" \
  '.data.tasks[] | select(.task == "'"$TASK4"'") | .backRef == "added" or .backRef == "already-present"' \
  -- lore link "$STORY_ID" "$TASK4" --json

chmod 444 "$TASK4_FILE"
chmod 555 backlog/tasks
step_fail "exit 6: drift (LORE-58 induced unlink write failure)" 6 \
  '.error_type == "drift" and (.input.tasks[]? | select(.task == "'"$TASK4"'") | .backRef == "failed")' \
  -- lore unlink "$STORY_ID" "$TASK4" --json
chmod 755 backlog/tasks
chmod 644 "$TASK4_FILE"

step "output auto-selects --plain off-TTY (piped, no --plain flag)" 0 -- bash -c 'lore query "archive" | cat >/dev/null'
step "--plain explicit flag" 0 -- lore query "archive" --plain

# ── Phase 25: tally ───────────────────────────────────────────────────────────────
tally
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
