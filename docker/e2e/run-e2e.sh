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

# ── Phase 5: live task rollup ────────────────────────────────────────────────
step_json "lore tasks --json (live rollup)" '.kind == "tasks.rollup" and (.data.tasks | length) >= 1' \
  -- lore tasks "$STORY_ID" --json

# ── Phase 6: mutate real backlog status, then sync ──────────────────────────
backlog task edit "$TASK1" --status "In Progress" >/dev/null 2>&1
backlog task edit "$TASK2" --status "Done" >/dev/null 2>&1
step_json "lore sync --json reflects a real backlog mutation + commits backlog/" \
  '.kind == "sync.result" and .data.backlogCommit.committed == true' -- lore sync --json
check "git log shows the lore-authored backlog/ commit" '[ "$(git log --oneline | wc -l | tr -d " ")" -gt 0 ]'

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
