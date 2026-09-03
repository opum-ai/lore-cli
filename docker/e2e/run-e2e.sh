#!/usr/bin/env bash
#
# docker/e2e/run-e2e.sh — the E2E test driver for LORE-56.
#
# Exercises the full `lore` command surface against a REAL, --json-capable
# `backlog` binary (installed from the exact published version pinned by
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

# ── Container-only guard (LORE-269) ──────────────────────────────────────────
# Everything below performs REAL, mutating filesystem operations rooted at cwd (git init,
# backlog init, lore init, and dozens more phases) and shells out to a real `backlog` binary.
# This script must only ever run inside its purpose-built e2e container (docker-compose.yml's
# `e2e` service; docker/e2e/Dockerfile bakes in LORE_E2E_CONTAINER=1 and guarantees WORKDIR
# /workspace) -- never directly on a host checkout of this repo.
#
# `set -uo pipefail` above deliberately omits `-e` (see report_write_failed's own comment
# further down) so the harness can keep running after an individual assertion fails. That same
# omission is exactly what made the ORIGINAL bug silent: an unguarded `cd /workspace` below, on
# a host where /workspace does not exist, would print "No such file or directory" to stderr and
# fall through -- every later phase would then silently run against whatever directory the
# caller happened to invoke this script from. Confirmed for real during round 5 wave 1
# (LORE-267): it overwrote backlog/config.yml, created spurious real Backlog tasks, and wrote
# stray .lore/*, AGENTS.md into a host worktree -- all uncommitted, but only noticed by luck.
#
# Two independent, purpose-built signals gate the fail-closed exit below, checked BEFORE even
# $RESULTS_DIR/$REPORT are created (i.e. before this script writes anywhere at all):
#   1. LORE_E2E_CONTAINER=1 -- an ENV baked into docker/e2e/Dockerfile, present only in images
#      built from it. A host shell would have to deliberately export this to defeat the guard.
#   2. /workspace exists and is the process's initial, empty, non-Git directory. This proves that
#      Phase 1 owns the repository it is about to initialize rather than reinitializing a caller's
#      checkout. It also prevents the E2E identity from ever applying to a pre-existing repository.
E2E_WORKSPACE="/workspace"
E2E_START_DIR="$(pwd -P)"
if [ "${LORE_E2E_CONTAINER:-}" != "1" ] || [ ! -d "$E2E_WORKSPACE" ] \
  || [ "$E2E_START_DIR" != "$E2E_WORKSPACE" ] \
  || [ -n "$(find "$E2E_START_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ] \
  || git -C "$E2E_START_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  {
    echo "run-e2e.sh must run inside its Docker e2e container -- not directly on a host checkout."
    echo "Refusing to bootstrap from '$E2E_START_DIR': it must begin in the empty disposable $E2E_WORKSPACE workspace."
    echo "It performs real, mutating filesystem operations (git init, backlog init, lore init, ...) rooted at its cwd."
    echo "Use:"
    echo "  docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e"
  } >&2
  exit 1
fi

# AC3 sweep (LORE-269): every OTHER `cd`/directory-change in this script (grepped exhaustively,
# not just skimmed) is one of:
#   - inside a subshell `( ... )` or command substitution `$( ... )`, which can never change this
#     script's own process-level cwd no matter what happens inside it, or
#   - inside a `bash -c '...'`/`bash -c "..."` invocation, ditto (a fresh child process), and
#     always `&&`-chained (`cd X && actual-command`) so a failed cd there short-circuits the
#     command that depended on it instead of running it against the wrong directory.
# The safety property that actually matters holds at every one of those sites regardless: none can
# leak a changed cwd into the rest of this script, and none can run a later command against the
# wrong directory -- unlike the bare top-level `cd /workspace` above. None of them match the shape
# this task's bug report describes, so none needed a fail-closed guard.
#
# A failed `cd` at every child/subshell site is also surfaced by harness accounting (LORE-273).
# Direct `step` wrappers consume the two nested-checkout statuses that previously disappeared or
# became a vacuous empty-string PASS. The remaining setup substitutions have explicit downstream
# assertions: outer-repo init checks `.git`, task creation checks `NESTED_TASK`, and Story creation
# checks `NESTED_STORY_ID`. Thus no child can mutate the wrong directory, and no failed directory
# setup can leave the final tally green.
RESULTS_DIR="${RESULTS_DIR:-/results}"
REPORT="$RESULTS_DIR/report.jsonl"
LORE_REPO="${LORE_REPO:-/opt/lore}"
BROKEN_FIXTURES="$LORE_REPO/test/fixtures/okf-bundle/broken"

mkdir -p "$RESULTS_DIR"
: > "$REPORT"

# The assertion helpers (log/record/step/step_json/step_fail/check/tally/critical) and the
# PASS/FAIL/REPORT_WRITE_FAILURES counters live in lib/steps.sh so that selftest.sh can prove each
# one DISCRIMINATES without a container (LCLI-360). One definition, two consumers -- a second copy
# here would be a fork that rots. RESULTS_DIR and REPORT above are the contract it expects.
# Fail CLOSED if the library is missing. `set -uo pipefail` omits -e, so a failed `.` would print
# one error and CONTINUE with every helper undefined -- each later `step`/`step_fail` becoming a
# "command not found" that the harness never records, ending in a green-looking tally over zero
# real assertions. That is the vacuous pass this whole extraction exists to prevent, so it must
# abort here instead. docker/e2e/Dockerfile must COPY lib/ beside the script; a test in
# test/docker-e2e-guard.test.ts pins that, since this line cannot be exercised without Docker.
E2E_LIB="$(dirname "${BASH_SOURCE[0]}")/lib/steps.sh"
if [ ! -r "$E2E_LIB" ]; then
  echo "run-e2e.sh: cannot read its assertion helpers at $E2E_LIB -- refusing to run a suite that would assert nothing." >&2
  exit 1
fi
# shellcheck source=lib/steps.sh
. "$E2E_LIB"

# Guarded (LORE-269) as defense-in-depth on top of the container check above: this is the
# literal `cd /workspace` the original bug report cited. The guard above already refuses to
# reach this line at all when /workspace doesn't exist, so this failing here would mean a
# genuinely unexpected condition (e.g. /workspace removed mid-run) -- fail loud rather than
# silently falling through to run every later phase against the wrong directory either way.
cd /workspace || {
  echo "run-e2e.sh: cd /workspace failed even after the container guard above -- refusing to continue." >&2
  exit 1
}

# These apply only to Git processes spawned by this harness (including Lore and Backlog's
# commits). Unlike `git config`, they cannot persist an E2E identity in any .git/config.
export GIT_AUTHOR_NAME="lore e2e"
export GIT_AUTHOR_EMAIL="e2e@lore.test"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

# ── Phase 0a: binary preflight (no project needed yet) ──────────────────────
# LORE-66 AC5 (housekeeping): the old version of this check only asserted exit 0 -- a broken
# version embed (falling back to some other hardcoded/empty string) would still pass. A bare
# non-"0.0.0" demand (mirroring the backlog check below) does NOT apply to lore itself: lore has
# not cut a release yet (ADR-0002's 2026-07-19 amendment; package.json's own version is
# genuinely "0.0.0" pre-release) -- confirmed empirically by this exact harness run. Assert
# instead that the compiled binary's --version output matches package.json's real value,
# whatever it currently is: this still catches a genuinely broken embed (a silent fallback to
# some OTHER default) without hardcoding a false "must not be 0.0.0" assumption.
check "lore --version matches package.json's real embedded version (proves the compile-time embed didn't silently fall back)" \
  'v="$(lore --version)"; pkgv="$(jq -r .version "$LORE_REPO/package.json")"; [ -n "$v" ] && [ "$v" = "$pkgv" ]'
step "lore --help prints the banner" 0 -- bash -c 'lore --help | grep -q "OKF-native documentation CLI"'
check "backlog --version prints a real (non-0.0.0) version" 'v="$(backlog --version)"; [ -n "$v" ] && [ "$v" != "0.0.0" ]'

# LORE-66 AC4: the router's own short-circuits (src/cli.ts) -- -v/-h short flags, a bare
# invocation with no command, and an entirely unknown top-level command -- never exercised before.
step_json "lore -v (short flag) prints the version envelope" '.kind == "version"' -- lore -v --json
step "lore -h (short flag) prints the banner" 0 -- bash -c 'lore -h | grep -q "OKF-native documentation CLI"'
step "bare \`lore\` (no command) prints the banner and exits 0" 0 -- bash -c 'lore | grep -q "OKF-native documentation CLI"'
step_fail "unknown top-level command is a usage error (exit 2)" 2 '.error_type == "usage"' \
  -- lore frobnicate --json

# LORE-66 AC4: pre-init "not a lore project" -- a fresh directory with no docs/ bundle at all
# (before even `backlog init`/`lore init` ran) fails loud (not_found, exit 3) rather than silently
# reporting an empty bundle. Fully isolated from /workspace's own project state.
mkdir -p /tmp/pre-init-probe
step_fail "pre-init: lore check in a directory with no docs/ bundle fails loud (not_found, exit 3)" 3 \
  '.error_type == "not_found"' \
  -- bash -c 'cd /tmp/pre-init-probe && lore check --json'
rm -rf /tmp/pre-init-probe

# LCLI-358.1: `lore init` requires a git worktree, because `lore sync` shells `git rev-parse HEAD`
# and `quest init` refuses a non-worktree path. A directory that is not a repository must be refused
# BEFORE anything is written, and `--allow-no-git` must still scaffold the docs-only bundle. Both
# run in isolated temp directories so /workspace's own bootstrap below is untouched.
mkdir -p /tmp/no-git-probe
step_fail "LCLI-358.1: lore init outside a git worktree is refused (validation, exit 6)" 6 \
  '.error_type == "validation" and (.message | test("not a git worktree"))' \
  -- bash -c 'cd /tmp/no-git-probe && lore init --json'
check "LCLI-358.1: the refused run wrote nothing at all" \
  '[ -z "$(ls -A /tmp/no-git-probe 2>/dev/null)" ]'
step_json "LCLI-358.1: --allow-no-git scaffolds a docs-only bundle outside a worktree" \
  '.kind == "init.result" and (.data.created | index("docs/index.md") != null)' \
  -- bash -c 'cd /tmp/no-git-probe && lore init --allow-no-git --json'
rm -rf /tmp/no-git-probe

# LCLI-358.2: the capability probe must follow the SELECTED tracker. Selecting quest previously
# still probed the `backlog` binary and reported Backlog.md as uninitialized. Asserted on the
# envelope rather than on stderr, so this holds whether or not quest is installed in the image:
# `trackerCheck` names quest, and the deprecated Backlog-only field stays absent.
#
# LCLI-376 made an uninitialized Quest workspace a FATAL probe failure (not just advisory), and
# that check (assertWorkspace) is a pure `.quest/workspace.toml` existence test that runs before
# quest's own binary is ever probed -- so it fires regardless of whether quest is installed in
# this image. The marker file's content is never read here (only its presence), so a placeholder
# is enough to clear the gate and let the rest of probe() proceed exactly as before LCLI-376.
mkdir -p /tmp/tracker-probe && (cd /tmp/tracker-probe && git init -q && mkdir -p .quest && : > .quest/workspace.toml)
step_json "LCLI-358.2: --tracker quest probes quest, and reports nothing about backlog" \
  '.kind == "init.result"
   and .data.trackerCheck.backend == "quest"
   and (.data.backlog == null)' \
  -- bash -c 'cd /tmp/tracker-probe && lore init --tracker quest --check-tracker --json'
step_json "LCLI-358.2: --tracker none runs no tracker probe at all" \
  '.kind == "init.result" and (.data.trackerCheck == null) and (.data.backlog == null)' \
  -- bash -c 'cd /tmp/tracker-probe && lore init --tracker none --check-tracker --json'
rm -rf /tmp/tracker-probe

# LCLI-356: an explicitly selected tracker is VERIFIED BEFORE it is persisted. These two cases
# cover the ACCEPTANCE path only: a capable backend is probed, reported capable, and written to
# config.
#
# COMMENT CORRECTED (LCLI-360). This block previously claimed it drove the below-the-floor
# REJECTION via "LORE_BACKLOG_BIN points the adapter at a stub that reports an ancient version"
# and asserted "the selection was NOT written" -- the exact opposite of what the cases below do,
# using machinery that does not exist. LORE_BACKLOG_BIN is set nowhere in this repository and read
# nowhere: src/adapters/backlog.ts hardcodes BACKLOG_BINARY = "backlog" with no env override. A
# reader auditing coverage would have concluded the refusal path was exercised here. It is not.
#
# So the refusal half of LCLI-356 AC#2 has NO e2e coverage. It is covered by unit tests, so the
# behaviour is not unverified -- but this harness does not exercise it, and adding a case that
# does needs a way to point the adapter at a stub binary, which lore does not currently offer.
# Tracked on LCLI-360; do not restore the old comment without also building what it describes.
mkdir -p /tmp/floor-probe && (cd /tmp/floor-probe && git init -q)
step_json "LCLI-356: an explicitly selected tracker is verified before it is persisted" \
  '.kind == "init.result" and .data.trackerCheck.backend == "backlog" and .data.trackerCheck.capable == true' \
  -- bash -c 'cd /tmp/floor-probe && backlog init "floor-probe" --defaults >/dev/null 2>&1 && lore init --tracker backlog --json'
check "LCLI-356: the verified selection is the one written to config" \
  'grep -q '"'"'backend = "backlog"'"'"' /tmp/floor-probe/.lore/config.toml'
rm -rf /tmp/floor-probe

# LCLI-358.3: the environment detection must be in the --json result, and nothing may be installed
# without an explicit flag. The image has backlog installed and quest/jira absent or present
# depending on the build, so the assertion is on the SHAPE (one entry per backend, each with the
# detection fields) plus the invariant that a bare selection installs nothing.
mkdir -p /tmp/env-probe && (cd /tmp/env-probe && git init -q)
step_json "LCLI-358.3: init reports one detection entry per backend" \
  '.kind == "init.result"
   and (.data.trackerEnvironment | length) == 3
   and ([.data.trackerEnvironment[].backend] | sort) == ["backlog", "jira", "quest"]
   and (.data.trackerEnvironment | all(has("installed") and has("package")))' \
  -- bash -c 'cd /tmp/env-probe && lore init --tracker none --json'
check "LCLI-358.3: a run with no install flag installed nothing" \
  '! lore init --tracker none --json 2>/dev/null | jq -e ".data.installed" >/dev/null'
rm -rf /tmp/env-probe

# ── Phase 1: bootstrap (critical — nothing downstream works without this) ───
critical "git init" 0 -- git init -q
critical "backlog init" 0 -- backlog init "lore-e2e" --defaults
# Mirror this repo's own backlog/config.yml contract (ADR-0012): lore must be
# the sole committer of backlog/.
backlog config set autoCommit false >/dev/null
backlog config set remoteOperations false >/dev/null
backlog config set checkActiveBranches false >/dev/null
critical "lore init" 0 -- lore init --tracker backlog
# `lore init` itself creates the (empty) .lore/cache/ directory as part of
# scaffolding — its mere existence isn't evidence of a cached probe result.
check "no stale probe result in .lore/cache/ before the first real probe" \
  '[ -z "$(ls -A .lore/cache 2>/dev/null)" ]'

# LORE-66 AC4: `lore init`'s idempotent re-run (init.ts's own load-bearing AC#2) was never
# exercised E2E — a second run with no intervening change must create nothing and still exit 0,
# with the plan's paths now reported `skipped` instead of `created`.
step_json "lore init: idempotent re-run creates nothing (AC#2)" \
  '(.data.created | length) == 0 and (.data.skipped | length) > 0' -- lore init --json

# ── Phase 1b: explicit Claude/Codex onboarding bridges (LCLI-298) ──────────────
# Bare non-TTY init intentionally configures neither agent, so the just-created bundle is the
# real-filesystem fresh state needed to exercise each prompt-free flag. Keep this probe ahead of
# task seeding, then remove only its generated bridge artifacts so Phase 22 still starts from its
# long-standing no-Claude-bridge baseline.
cp AGENTS.md /tmp/lcli-298-agents-baseline.md
LCLI298_AGENTS_BASELINE_HASH="$(sha256sum AGENTS.md)"
step_json "LCLI-298 AC1: lore init --codex creates both Codex bridge files on a fresh bundle" \
  '.kind == "init.result"
   and ((.data.codex.files | map(.path) | sort) == [".codex/skills/lore/SKILL.md", "AGENTS.md"])
   and ([.data.codex.files[] | select(.path == ".codex/skills/lore/SKILL.md")][0].action == "created")
   and ([.data.codex.files[] | select(.path == "AGENTS.md")][0].action == "updated")' \
  -- lore init --codex --json
check "LCLI-298 AC1: Codex SKILL.md and AGENTS.md managed block exist on disk" \
  '[ -f .codex/skills/lore/SKILL.md ] \
   && grep -q "^name: lore$" .codex/skills/lore/SKILL.md \
   && grep -q "<!-- lore:agents:begin -->" AGENTS.md \
   && grep -q "<!-- lore:agents:end -->" AGENTS.md'

CODEX_BRIDGE_HASH_BEFORE="$(sha256sum .codex/skills/lore/SKILL.md AGENTS.md)"
step_json "LCLI-298 AC2: a second lore init --codex reports a complete no-op" \
  '(.data.created | length) == 0
   and (.data.codex.files | length == 2)
   and (.data.codex.files | all(.action == "unchanged"))' \
  -- lore init --codex --json
CODEX_BRIDGE_HASH_AFTER="$(sha256sum .codex/skills/lore/SKILL.md AGENTS.md)"
check "LCLI-298 AC2: the idempotent Codex re-run left both files byte-identical" \
  '[ "$CODEX_BRIDGE_HASH_BEFORE" = "$CODEX_BRIDGE_HASH_AFTER" ]'

step_json "LCLI-298 AC3: lore init --claude creates the Claude Code bridge" \
  '((.data.agents.files | map(.path) | sort) == [".claude/skills/lore/SKILL.md", "CLAUDE.md"])
   and (.data.agents.files | all(.action == "created"))' \
  -- lore init --claude --json
check "LCLI-298 AC3: both Claude Code bridge files exist on disk" \
  '[ -f .claude/skills/lore/SKILL.md ] && [ -f CLAUDE.md ]'
step_json "LCLI-298 AC2: lore agents --check is clean after lore init --claude" \
  '.kind == "agents.result" and (.data.files | all(.action == "unchanged"))' \
  -- lore agents --check --json

# AGENTS.md is a surgical managed-block update: prose outside the markers must survive while a
# stale line inside the markers is restored from the generator on the next --codex run.
sed -i '/<!-- lore:agents:begin -->/i LCLI-298-CUSTOM-PROSE-BEFORE-THE-BLOCK' AGENTS.md
sed -i '/<!-- lore:agents:end -->/a LCLI-298-CUSTOM-PROSE-AFTER-THE-BLOCK' AGENTS.md
sed -i '/<!-- lore:agents:begin -->/,/<!-- lore:agents:end -->/ s/Skill:/CORRUPTED-CODEX-SKILL-LABEL:/' AGENTS.md
check "LCLI-298 AC4: seeded custom prose around a deliberately stale Codex managed block" \
  'grep -q "LCLI-298-CUSTOM-PROSE-BEFORE-THE-BLOCK" AGENTS.md \
   && grep -q "LCLI-298-CUSTOM-PROSE-AFTER-THE-BLOCK" AGENTS.md \
   && grep -q "CORRUPTED-CODEX-SKILL-LABEL:" AGENTS.md'
step_json "LCLI-298 AC4: lore init --codex refreshes only the stale AGENTS.md block" \
  '([.data.codex.files[] | select(.path == "AGENTS.md")][0].action == "updated")
   and ([.data.codex.files[] | select(.path == ".codex/skills/lore/SKILL.md")][0].action == "unchanged")' \
  -- lore init --codex --json
check "LCLI-298 AC4: custom AGENTS.md prose survived and managed content was healed" \
  'grep -q "LCLI-298-CUSTOM-PROSE-BEFORE-THE-BLOCK" AGENTS.md \
   && grep -q "LCLI-298-CUSTOM-PROSE-AFTER-THE-BLOCK" AGENTS.md \
   && ! grep -q "CORRUPTED-CODEX-SKILL-LABEL:" AGENTS.md \
   && grep -q "Skill:" AGENTS.md'

step "LCLI-298 AC5: remove only the bridge artifacts created by the isolated probe" 0 \
  -- bash -c 'rm -f CLAUDE.md .codex/skills/lore/SKILL.md .claude/skills/lore/SKILL.md &&
               cp /tmp/lcli-298-agents-baseline.md AGENTS.md &&
               rm -f /tmp/lcli-298-agents-baseline.md &&
               rmdir .codex/skills/lore .codex/skills .codex &&
               rmdir .claude/skills/lore .claude/skills .claude'
check "LCLI-298 AC5: bridge probe teardown left no generated agent artifacts" \
  '[ "$(sha256sum AGENTS.md)" = "$LCLI298_AGENTS_BASELINE_HASH" ] \
   && [ ! -e CLAUDE.md ] && [ ! -e .codex ] && [ ! -e .claude ]'

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

# ── Phase 3d: lore new flag long-tail -- --var/--template/--summary/--tags/--out (LORE-66 AC4) ──
# A custom .lore/templates/spec.md exercises --var (body placeholder fill) via the DEFAULT
# type-name template-resolution path; a second, explicitly-named template file exercises
# --template overriding that default resolution. Spec is never `lore new`'d again anywhere else
# in this script, so a stray custom template has no effect on any later phase; both are removed
# immediately after anyway.
cat > .lore/templates/spec.md <<'TPLEOF'
# {{title}}

Owner: {{owner}}
TPLEOF
VAR_PROBE_OUT="$(lore new Spec "E2E var template probe" --var owner=jeremy --json)"
VAR_PROBE_RC=$?
check "AC4: lore new --var succeeds against the default type-name template resolution" '[ "$VAR_PROBE_RC" -eq 0 ]'
VAR_PROBE_PATH="$(echo "$VAR_PROBE_OUT" | jq -r '.data.path')"
check "AC4: --var filled the body placeholder from the resolved .lore/templates/spec.md" \
  'grep -q "Owner: jeremy" "$VAR_PROBE_PATH"'

cat > .lore/templates/e2e-explicit-template.md <<'TPLEOF'
# {{title}}

EXPLICIT-TEMPLATE-MARKER: {{owner}}
TPLEOF
TEMPLATE_PROBE_OUT="$(lore new Spec "E2E explicit template probe" --template e2e-explicit-template --var owner=explicit --json)"
TEMPLATE_PROBE_RC=$?
check "AC4: lore new --template succeeds, overriding the default type-name resolution" '[ "$TEMPLATE_PROBE_RC" -eq 0 ]'
TEMPLATE_PROBE_PATH="$(echo "$TEMPLATE_PROBE_OUT" | jq -r '.data.path')"
check "AC4: --template used the EXPLICITLY named file, not the default spec.md" \
  'grep -q "EXPLICIT-TEMPLATE-MARKER: explicit" "$TEMPLATE_PROBE_PATH" && ! grep -q "^Owner:" "$TEMPLATE_PROBE_PATH"'
rm -f .lore/templates/spec.md .lore/templates/e2e-explicit-template.md

step_json "AC4: lore new --summary/--tags/--out together" \
  '.data.path == "docs/specs/e2e-custom-out-path.md"' \
  -- lore new Spec "E2E summary tags out probe" --summary "AC4 custom summary marker" --tags "e2e-tag-alpha,e2e-tag-beta" --out docs/specs/e2e-custom-out-path.md --json
check "AC4: --out landed the file at the exact given path, not the slugified default" \
  '[ -f docs/specs/e2e-custom-out-path.md ]'
check "AC4: --summary wrote the given summary text into frontmatter" \
  'grep -q "AC4 custom summary marker" docs/specs/e2e-custom-out-path.md'
check "AC4: --tags wrote both comma-split, trimmed tags into frontmatter" \
  'grep -q "e2e-tag-alpha" docs/specs/e2e-custom-out-path.md && grep -q "e2e-tag-beta" docs/specs/e2e-custom-out-path.md'

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

# ── Phase 4b: field-isolated write read-backs + multi-doc SET/REPLACE (LORE-65 AC1) ─────────
# Phase 4's own assertions only check lore's SELF-COMPUTED backRef status ("added"/"already-present")
# and the frontmatter tasks: list -- never the real Backlog record's label and documentation arrays
# INDEPENDENTLY. A partial-write bug (a mangled --add-label comma-join while --doc lands, or vice
# versa; src/adapters/backlog.ts editTask) would still report "added" either way, since editTask only
# throws on a nonzero exit, never on a flag it silently dropped. Read the real record back and assert
# each field on its own.
step_json "AC1: real record carries TASK1's doc: label after Phase 4's link (isolated from the doc check)" \
  '.task.labels | index("doc:'"$STORY_ID"'") != null' -- backlog task view "$TASK1" --json
step_json "AC1: real record carries TASK1's doc path after Phase 4's link (isolated from the label check)" \
  '.task.documentation | index("'"$STORY_PATH"'") != null' -- backlog task view "$TASK1" --json

# Multi-doc SET/REPLACE: TASK1 linked from a SECOND, freshly-created, minimally-coupled Story too
# (LORE-63/64 convention: isolate onto a fresh concept so $STORY_ID's other state never masks which
# concept's unlink actually ran).
MULTI_STORY_OUT="$(lore new Story "E2E multi-doc probe Story" --json 2>/tmp/multi-story-err)"
MULTI_STORY_RC=$?
check "AC1: fresh multi-doc probe Story created" '[ "$MULTI_STORY_RC" -eq 0 ]'
MULTI_STORY_ID=""
MULTI_STORY_PATH=""
if [ "$MULTI_STORY_RC" -eq 0 ]; then
  MULTI_STORY_ID="$(echo "$MULTI_STORY_OUT" | jq -r '.data.id')"
  MULTI_STORY_PATH="$(echo "$MULTI_STORY_OUT" | jq -r '.data.path')"
fi

step_json "AC1: link TASK1 to the SECOND Story too (one task, two docs)" \
  '.data.tasks[] | select(.task == "'"$TASK1"'") | .status == "added" and .backRef == "added"' \
  -- lore link "$MULTI_STORY_ID" "$TASK1" --json
step_json "AC1: real record now carries BOTH docs' labels" \
  '(.task.labels | index("doc:'"$STORY_ID"'") != null) and (.task.labels | index("doc:'"$MULTI_STORY_ID"'") != null)' \
  -- backlog task view "$TASK1" --json
step_json "AC1: real record now carries BOTH docs' paths" \
  '(.task.documentation | index("'"$STORY_PATH"'") != null) and (.task.documentation | index("'"$MULTI_STORY_PATH"'") != null)' \
  -- backlog task view "$TASK1" --json

step_json "AC1: unlink TASK1 from the SECOND Story only" \
  '.data.tasks[] | select(.task == "'"$TASK1"'") | .backRef == "removed"' \
  -- lore unlink "$MULTI_STORY_ID" "$TASK1" --json
step_json "AC1: unlink preserved the FIRST Story's doc: label (SET/REPLACE, not overwrite)" \
  '.task.labels | index("doc:'"$STORY_ID"'") != null' -- backlog task view "$TASK1" --json
step_json "AC1: unlink preserved the FIRST Story's doc path too" \
  '.task.documentation | index("'"$STORY_PATH"'") != null' -- backlog task view "$TASK1" --json
step_json "AC1: unlink actually removed the SECOND Story's label" \
  '.task.labels | index("doc:'"$MULTI_STORY_ID"'") == null' -- backlog task view "$TASK1" --json

step_json "AC1: re-link TASK1 to the SECOND Story (SET/REPLACE preserving the first)" \
  '.data.tasks[] | select(.task == "'"$TASK1"'") | .backRef == "added"' \
  -- lore link "$MULTI_STORY_ID" "$TASK1" --json
step_json "AC1: re-link preserved BOTH docs' labels" \
  '(.task.labels | index("doc:'"$STORY_ID"'") != null) and (.task.labels | index("doc:'"$MULTI_STORY_ID"'") != null)' \
  -- backlog task view "$TASK1" --json

# Restore baseline: TASK1 ends this phase linked ONLY to the ORIGINAL Story (Phase 4's state),
# matching every downstream phase's expectation.
step_json "AC1: restore baseline -- unlink TASK1 from the multi-doc probe Story" \
  '.data.tasks[] | select(.task == "'"$TASK1"'") | .backRef == "removed"' \
  -- lore unlink "$MULTI_STORY_ID" "$TASK1" --json
rm -f /tmp/multi-story-err

# ── Phase 4c: backlog-side file moves via --title edit + archive (LORE-65 AC2) ──────────────
# EXPLORATORY FINDING (re-derived against the pinned fork's own file-system/operations.ts
# saveTask, confirmed by a local empirical probe before writing this phase): a `--title` edit does
# NOT rename the task's file. saveTask's shouldPreservePath branch reuses the task's EXISTING
# filePath whenever one is already set (which task edit's load-then-save round trip always
# carries), so the filename stays anchored to the id + ORIGINAL title. The filing task's assumption
# was wrong (same pattern as every prior E2E session in this campaign). The title still flows into
# the managed block's Title column via the JSON title field, independent of the filename question.
TASK1_TITLE_FILE_BEFORE="$(find backlog/tasks -iname "${TASK1} - *.md" | head -1)"
check "AC2: found TASK1's file before the title edit" '[ -n "${TASK1_TITLE_FILE_BEFORE:-}" ]'
step "AC2: backlog-side --title edit (real binary, not via lore)" 0 \
  -- backlog task edit "$TASK1" --title "Design the archive endpoint (retitled)"
TASK1_TITLE_FILE_AFTER="$(find backlog/tasks -iname "${TASK1} - *.md" | head -1)"
check "AC2 finding: a --title edit does NOT rename the file (filePath is preserved on edit)" \
  '[ "$TASK1_TITLE_FILE_AFTER" = "$TASK1_TITLE_FILE_BEFORE" ]'
step_json "AC2: lore sync flows the new title into the managed block's Title column" \
  '.kind == "sync.result"' -- lore sync "$STORY_ID" --json
check "AC2: managed block shows TASK1's NEW title" \
  'grep -F -- "[$TASK1]" "$STORY_PATH" | grep -q "retitled"'
step "AC2: restore TASK1's original title" 0 -- backlog task edit "$TASK1" --title "Design the archive endpoint"
step_json "AC2: lore sync heals the managed block's Title column back" '.kind == "sync.result"' -- lore sync "$STORY_ID" --json

# The REAL backlog-side file-move operation: `task archive` (archiveTask does a real rename() to
# backlog/archive/tasks/ -- confirmed against the pinned fork's source). getTaskPath only ever scans
# backlog/tasks/, never the archive dir, so an archived LINKED task (TASK2, still linked from Phase
# 4) should read as missing via the SAME exit-1/empty-stdout raw signature LORE-62 already pinned
# for a physically-vanished file (Phase 5b above) -- exploratory-first per this campaign's own
# convention: assert the mirrored signature, but this is the actual first real run pinning it.
TASK2_LC="$(printf '%s' "$TASK2" | tr 'A-Z' 'a-z')"
TASK2_FILE_BEFORE_ARCHIVE="$(find backlog/tasks -iname "${TASK2} - *.md" | head -1)"
check "AC2: found TASK2's file before archiving" '[ -n "${TASK2_FILE_BEFORE_ARCHIVE:-}" ]'
step "AC2: backlog task archive (real binary move backlog/tasks/ -> backlog/archive/tasks/)" 0 \
  -- backlog task archive "$TASK2"
check "AC2: the file physically moved to backlog/archive/tasks/" \
  '[ ! -f "$TASK2_FILE_BEFORE_ARCHIVE" ] && [ -f "backlog/archive/tasks/$(basename "$TASK2_FILE_BEFORE_ARCHIVE")" ]'
check "AC2: raw binary: task view of the now-archived id exits 1 with empty stdout (mirrors a vanished task)" \
  'out="$(backlog task view "$TASK2" --json 2>/dev/null)"; rc=$?; [ "$rc" -eq 1 ] && [ -z "$out" ]'

step_fail "AC2: lore sync -- an archived linked task fails loud exactly like a vanished one (not_found, exit 3, empty stdout)" 3 \
  '.error_type == "not_found" and (.message | contains("'"$TASK2_LC"'"))' \
  -- lore sync "$STORY_ID" --json

lore check docs/stories --json >/tmp/check-archive-out 2>/tmp/check-archive-err
CHECK_ARCHIVE_RC=$?
check "AC2: lore check on the archived-task bundle ALSO exits 3 but still emits its check.report on stdout first (mirrors the vanished-task asymmetry)" \
  '[ "$CHECK_ARCHIVE_RC" -eq 3 ] && jq -e ".kind == \"check.report\"" /tmp/check-archive-out >/dev/null 2>&1'
rm -f /tmp/check-archive-out /tmp/check-archive-err

step "AC2: lore tasks soft-drops the archived id (exit 0)" 0 -- lore tasks "$STORY_ID" --json
lore tasks "$STORY_ID" --json >/tmp/tasks-archive-out 2>/tmp/tasks-archive-err
check "AC2: archived id dropped from the rollup, with a stderr warning naming it" \
  '! (jq -e ".data.tasks[]? | select(.id == \"$TASK2\")" /tmp/tasks-archive-out >/dev/null 2>&1) \
   && grep -qi "$TASK2" /tmp/tasks-archive-err'
rm -f /tmp/tasks-archive-out /tmp/tasks-archive-err

# Restore: archiveTask is a pure rename() (no content rewrite, confirmed against source), so moving
# the file back to backlog/tasks/ restores TASK2's real record byte-identically -- no re-link needed.
mkdir -p backlog/tasks
mv "backlog/archive/tasks/$(basename "$TASK2_FILE_BEFORE_ARCHIVE")" "$TASK2_FILE_BEFORE_ARCHIVE"
check "AC2: TASK2 restored to backlog/tasks/, real record intact (still carries the doc: back-ref)" \
  'backlog task view "$TASK2" --json | jq -e ".task.labels | index(\"doc:$STORY_ID\") != null" >/dev/null 2>&1'
check "AC2: git status clean under backlog/ after the archive round-trip (byte-identical restore)" \
  '[ -z "$(git status --porcelain -- backlog/)" ]'

# ── Phase 4d: ADR-0012 commit scoping (LORE-65 AC3) ──────────────────────────────────────────
# (1) Inspect a lore-authored commit's file list directly: every path it touches must be under
# backlog/ and nothing else (state.ts's own structural guard, exercised here against real git
# history rather than just trusting the guard never throws).
check "AC3: the most recent lore-authored commit (Phase 4c's title-restore sync) touches ONLY backlog/ paths" \
  'AC3_FILES="$(git diff-tree --no-commit-id --name-only -r HEAD)"; [ -n "$AC3_FILES" ] && ! printf "%s\n" "$AC3_FILES" | grep -qv "^backlog/"'

# (2) A pre-staged unrelated file (outside backlog/) must survive a scoped commit unswept.
echo "unrelated in-flight work" > UNRELATED-DIRTY-MARKER.txt
check "AC3: pre-staged unrelated file is dirty before the next lore write" \
  '[ -n "$(git status --porcelain -- UNRELATED-DIRTY-MARKER.txt)" ]'
TASK_SCOPE="$(backlog task create "E2E commit-scoping probe task" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "AC3: seeded a task for the commit-scoping probe" '[ -n "$TASK_SCOPE" ]'
step_json "AC3: lore link commits backlog/ scoped to exactly its own write" \
  '.data.backlogCommit.committed == true' -- lore link "$STORY_ID" "$TASK_SCOPE" --json
check "AC3: the unrelated pre-staged file survived UNSWEPT by the scoped commit" \
  '[ -n "$(git status --porcelain -- UNRELATED-DIRTY-MARKER.txt)" ]'
check "AC3: the lore-authored commit that just ran still touches ONLY backlog/ paths" \
  'AC3_FILES2="$(git diff-tree --no-commit-id --name-only -r HEAD)"; [ -n "$AC3_FILES2" ] && ! printf "%s\n" "$AC3_FILES2" | grep -qv "^backlog/"'
rm -f UNRELATED-DIRTY-MARKER.txt

# (3) A backlog/ filename containing glob metacharacters must be handled byte-for-byte, never
# shell/git-glob-expanded. Backlog's own sanitizeFilename strips ()[] entirely and turns * into a
# hyphen (confirmed against the pinned fork's file-system/operations.ts) -- no title the real CLI
# accepts can ever put a glob metachar in a backlog/ filename. Rename the file directly on disk
# instead: any file that lands under backlog/ by ANY means (a hand edit, a future Backlog version, a
# differently-behaved fork) is exactly what state.ts's :(literal) pathspec guard exists to protect,
# regardless of how it got there.
TASK_METACHAR="$(backlog task create "E2E metachar pathspec probe" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "AC3: seeded the metachar-pathspec probe task" '[ -n "$TASK_METACHAR" ]'
TASK_METACHAR_FILE="$(find backlog/tasks -iname "${TASK_METACHAR} - *.md" | head -1)"
check "AC3: found the metachar probe task's original file" '[ -n "${TASK_METACHAR_FILE:-}" ] && [ -f "$TASK_METACHAR_FILE" ]'
TASK_METACHAR_GLOB_FILE="$(dirname "$TASK_METACHAR_FILE")/$(basename "$TASK_METACHAR_FILE" .md) [glob-test]*weird.md"
mv "$TASK_METACHAR_FILE" "$TASK_METACHAR_GLOB_FILE"
check "AC3: the metachar filename now sits under backlog/tasks/, untracked" \
  '[ -f "$TASK_METACHAR_GLOB_FILE" ] && git status --porcelain -- backlog/ | grep -qF "$(basename "$TASK_METACHAR_GLOB_FILE")"'
step_json "AC3: lore sync's catch-all sweep commits the metachar filename via :(literal) (real git, not shell glob)" \
  '.data.backlogCommit.committed == true' -- lore sync --json
check "AC3: the metachar file was actually committed under its exact real name" \
  'git diff-tree --no-commit-id --name-only -r HEAD | grep -qF "$(basename "$TASK_METACHAR_GLOB_FILE")"'
check "AC3: git status clean under backlog/ after the metachar commit (no stranded/duplicated entry)" \
  '[ -z "$(git status --porcelain -- backlog/)" ]'

# ── Phase 4e: link --no-back-ref, unlink --allow-missing (LORE-66 AC4) ───────────────────────
# `link --no-back-ref` (skip the Backlog-side doc: label/--doc write, only the concept's own
# frontmatter tasks: list) was never exercised.
TASK_NBR="$(backlog task create "E2E no-back-ref probe task" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "AC4: seeded TASK_NBR for the --no-back-ref probe" '[ -n "$TASK_NBR" ]'
step_json "AC4: lore link --no-back-ref skips the Backlog-side write" \
  '.data.tasks[] | select(.task == "'"$TASK_NBR"'") | .status == "added" and .backRef == "skipped"' \
  -- lore link "$STORY_ID" "$TASK_NBR" --no-back-ref --json
check "AC4: --no-back-ref still wrote the concept's own tasks: frontmatter" \
  'grep -qi "$TASK_NBR" "$STORY_PATH"'
check "AC4: --no-back-ref left the REAL Backlog record untouched (no doc: label, no --doc path)" \
  'backlog task view "$TASK_NBR" --json | jq -e --arg lbl "doc:$STORY_ID" --arg p "$STORY_PATH" \
     "(.task.labels | index(\$lbl) == null) and (.task.documentation | index(\$p) == null)" >/dev/null 2>&1'
step_json "AC4: restore baseline -- unlink TASK_NBR (nothing to remove on the Backlog side)" \
  '.data.tasks[] | select(.task == "'"$TASK_NBR"'") | .status == "removed"' \
  -- lore unlink "$STORY_ID" "$TASK_NBR" --json

# `unlink --allow-missing` -- id itself no longer resolves to a live concept (the doc was removed
# by a plain `rm`, never through `lore rename`). Without the flag this is a hard not_found; with
# it, the Backlog-side label/--doc removal still runs, computed straight from the bare id string.
GHOST_OUT="$(lore new Story "E2E ghost concept for --allow-missing" --json)"
GHOST_ID="$(echo "$GHOST_OUT" | jq -r '.data.id')"
GHOST_PATH="$(echo "$GHOST_OUT" | jq -r '.data.path')"
check "AC4: seeded the ghost concept" '[ -n "$GHOST_ID" ] && [ "$GHOST_ID" != "null" ]'
TASK_GHOST="$(backlog task create "E2E allow-missing probe task" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "AC4: seeded TASK_GHOST for the --allow-missing probe" '[ -n "$TASK_GHOST" ]'
step_json "AC4: link TASK_GHOST to the ghost concept (real backref)" \
  '.data.tasks[] | select(.task == "'"$TASK_GHOST"'") | .backRef == "added"' \
  -- lore link "$GHOST_ID" "$TASK_GHOST" --json
rm -f "$GHOST_PATH"
check "AC4: the ghost concept's file no longer exists (removed outside lore's tracking)" '[ ! -f "$GHOST_PATH" ]'
step_fail "AC4: without --allow-missing, unlinking a vanished concept id fails loud (not_found, exit 3)" 3 \
  '.error_type == "not_found"' \
  -- lore unlink "$GHOST_ID" "$TASK_GHOST" --json
step_json "AC4: unlink --allow-missing tolerates the vanished concept id and still removes the real backref" \
  '.data.concept == "'"$GHOST_PATH"'" and .data.changed == false and (.data.tasks[] | select(.task == "'"$TASK_GHOST"'") | .status == "not-linked" and .backRef == "removed")' \
  -- lore unlink "$GHOST_ID" "$TASK_GHOST" --allow-missing --json
# EXPLORATORY FINDING (a real-record dump surfaced this): the --doc array does NOT end up
# cleared. This is not a bug -- it is link.ts's own documented ADR-0009 SS2 tradeoff: TASK_GHOST
# had exactly ONE documentation entry, so removing it would leave the array empty, and Backlog's
# CLI cannot clear --doc via an empty value (SS2.4) -- removeBackRefs deliberately OMITS --doc
# entirely in that case, so the stale path cosmetically lingers until the next `lore link`. The
# label removal (unconditional, no such empty-array special case) is the real, always-true signal.
check "AC4: --allow-missing actually removed the real doc: label from Backlog" \
  'backlog task view "$TASK_GHOST" --json | jq -e --arg lbl "doc:$GHOST_ID" \
     "(.task.labels | index(\$lbl) == null)" >/dev/null 2>&1'
check "AC4: the stale --doc path deliberately lingers (ADR-0009's accepted single-entry tradeoff, not a bug)" \
  'backlog task view "$TASK_GHOST" --json | jq -e --arg p "$GHOST_PATH" \
     "(.task.documentation | index(\$p) != null)" >/dev/null 2>&1'

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

# ── Phase 3c: capability probe, PRESENT-but-incapable branch (LORE-62 AC3) ──────────────────
# The negative tests above only ever exercise the MISSING-binary half of probeBacklog's split
# (exit 3). The present-but-incapable half (exit 6, validation) never runs in this harness,
# because the image ships only the capable published package. Two PATH-shadowed stub `backlog`
# scripts cover both variants src/adapters/backlog.ts's probeBacklog distinguishes: a version
# below MIN_BACKLOG_VERSION ("1.49.0"), and a version-capable binary whose `task list --json`
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
  echo "1.49.0"
else
  echo "not json, plain stock output"
fi
STUB
chmod +x /tmp/stub-backlog-not-json-capable/backlog

step_fail "capability probe: version below the 1.49.0 floor drives validation (exit 6), not not_found" 6 \
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
VANISH_STORY_OUT="$(lore new Story "E2E vanished task story" --json)"
VANISH_STORY_ID="$(echo "$VANISH_STORY_OUT" | jq -r '.data.id')"
VANISH_STORY_PATH="$(echo "$VANISH_STORY_OUT" | jq -r '.data.path')"
check "seeded an isolated task-capable Story for vanished-task behavior" \
  '[ -n "$VANISH_STORY_ID" ] && [ "$VANISH_STORY_ID" != "null" ] && [ -f "$VANISH_STORY_PATH" ]'
step_fail "lore link: a nonexistent task id fails before any write (not_found, exit 3)" 3 \
  '.error_type == "not_found"' \
  -- lore link "$VANISH_STORY_ID" "$BOGUS_TASK_ID" --json
check "lore link's failed validation left the Story's frontmatter untouched" \
  '! grep -qi "$BOGUS_TASK_ID" "$VANISH_STORY_PATH"'

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
step_json "lore link: attach TASK5 to the isolated Story (for the vanishing test)" \
  '.data.tasks[] | select(.task == "'"$TASK5"'") | .status == "added"' \
  -- lore link "$VANISH_STORY_ID" "$TASK5" --json
TASK5_FILE=""
[ -n "$TASK5" ] && TASK5_FILE="$(find backlog/tasks -iname "${TASK5} - *.md" | head -1)"
check "found TASK5's backlog file on disk" '[ -n "${TASK5_FILE:-}" ] && [ -f "$TASK5_FILE" ]'
mv "$TASK5_FILE" /tmp/vanished-task5.md

step_fail "lore sync: a vanished linked task fails loud (not_found, exit 3, empty stdout)" 3 \
  '.error_type == "not_found" and (.message | contains("'"$TASK5_LC"'"))' \
  -- lore sync "$VANISH_STORY_ID" --json

lore check docs/stories --json >/tmp/check-vanish-out 2>/tmp/check-vanish-err
CHECK_VANISH_RC=$?
check "lore check: a vanished linked task ALSO exits 3, but (unlike sync) still emits its check.report on stdout first" \
  '[ "$CHECK_VANISH_RC" -eq 3 ] \
   && jq -e ".kind == \"check.report\"" /tmp/check-vanish-out >/dev/null 2>&1 \
   && tail -n1 /tmp/check-vanish-err | jq -e ".error_type == \"not_found\" and (.message | contains(\"$TASK5_LC\"))" >/dev/null 2>&1'
rm -f /tmp/check-vanish-out /tmp/check-vanish-err

# AC2d: `lore tasks` SOFT-drops the dangling id instead of failing: exit 0, the id absent
# from the rollup, a stderr warning naming it.
step "lore tasks: soft-drops a dangling linked id (exit 0)" 0 -- lore tasks "$VANISH_STORY_ID" --json
lore tasks "$VANISH_STORY_ID" --json >/tmp/tasks-vanish-out 2>/tmp/tasks-vanish-err
check "lore tasks: dangling id dropped from the rollup, with a stderr warning naming it" \
  '! (jq -e ".data.tasks[]? | select(.id == \"$TASK5\")" /tmp/tasks-vanish-out >/dev/null 2>&1) \
   && grep -qi "$TASK5" /tmp/tasks-vanish-err'
rm -f /tmp/tasks-vanish-out /tmp/tasks-vanish-err

# Restore state so later phases see a clean, unlinked probe Story again.
mv /tmp/vanished-task5.md "$TASK5_FILE"
step_json "lore unlink: detach TASK5 from the isolated Story (restore state)" \
  '.data.tasks[] | select(.task == "'"$TASK5"'") | .backRef == "removed"' \
  -- lore unlink "$VANISH_STORY_ID" "$TASK5" --json

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
# LORE-66 AC5 (housekeeping): the old version of this check (`git log | wc -l > 0`) passes on ANY
# commit ever made in the repo -- it attributes nothing to this sync. Assert the real content of
# the commit sync just authored: its exact message (state.ts's DEFAULT_COMMIT_MESSAGE) and that its
# file list is scoped to backlog/ only.
check "the lore-authored backlog/ commit this sync just made has the real commit message + scoped file list" \
  '[ "$(git log -1 --format=%s)" = "chore(backlog): sync task changes" ] \
   && GITLOG_FILES="$(git diff-tree --no-commit-id --name-only -r HEAD)" \
   && [ -n "$GITLOG_FILES" ] && ! printf "%s\n" "$GITLOG_FILES" | grep -qv "^backlog/"'
# LORE-66 AC4: `tasks --status <S>` filters the rollup to one live Backlog status -- Phase 5's
# rollup test above passes no --status at all.
step_json "AC4: lore tasks --status filters the rollup to TASK1's live status only" \
  '.data.status == "In Progress" and (.data.tasks | length) == 1 and (.data.tasks[0].id | ascii_downcase) == ("'"$TASK1"'" | ascii_downcase)' \
  -- lore tasks "$STORY_ID" --status "In Progress" --json
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

# ── Phase 6b: sync --dry-run, sync --no-index (LORE-66 AC4) ──────────────────────────────────
# `--dry-run` (report what would change, write nothing) was never exercised -- needs genuine
# PENDING drift to be non-vacuous. Corrupt the version-selected task-rollup field directly (the
# same lever Phase 9 below uses for its own drift-detection test) rather than touching either live
# task's real Backlog status, which Phase 9's managed-block body-drift induction depends on staying
# exactly as this phase left it. New harness bundles are OKF 0.2, so reconciliation owns
# `lore_task_status`; lifecycle `status` must remain independent.
sed -i 's/^lore_task_status: .*/lore_task_status: todo/' "$STORY_PATH" || true
check "AC4: seeded a genuine frontmatter task-status drift for the dry-run probe" \
  'grep -q "^lore_task_status: todo" "$STORY_PATH"'
step_json "AC4: lore sync --dry-run reports the pending drift without writing" \
  '.data.dryRun == true and (.data.filesChanged >= 1)' -- lore sync --dry-run --json
check "AC4: --dry-run wrote NOTHING -- the stale task status is still on disk, untouched" \
  'grep -q "^lore_task_status: todo" "$STORY_PATH"'
step_json "AC4: the real (non-dry-run) sync now heals the same drift" \
  '.data.dryRun == false and (.data.filesChanged >= 1)' -- lore sync --json
check "AC4: the stale task status is gone after the real sync (healed to live data)" \
  '! grep -q "^lore_task_status: todo" "$STORY_PATH"'

# `--no-index` skips both index.md and log.md regeneration. Corrupt docs/log.md directly (genuine
# staleness relative to what regeneration would produce) rather than relying on ambient drift.
echo "BOGUS-LOG-CORRUPTION-NOINDEX-PROBE" >> docs/log.md
check "AC4: seeded genuine log.md staleness for the --no-index probe" \
  'grep -q "BOGUS-LOG-CORRUPTION-NOINDEX-PROBE" docs/log.md'
step_json "AC4: sync --no-index reconciles docs/ but skips index/log regeneration" \
  '.kind == "sync.result"' -- lore sync --no-index --json
check "AC4: --no-index left the corrupted log.md untouched (not regenerated)" \
  'grep -q "BOGUS-LOG-CORRUPTION-NOINDEX-PROBE" docs/log.md'
step_json "AC4: a normal sync (no --no-index) DOES regenerate log.md, healing the corruption" \
  '.kind == "sync.result"' -- lore sync --json
check "AC4: log.md regenerated -- the bogus corruption is gone" \
  '! grep -q "BOGUS-LOG-CORRUPTION-NOINDEX-PROBE" docs/log.md'

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
# LCLI-299 AC1: the bundle already contains one freshly-created concept of every built-in type
# (Phase 3), so this is a genuinely mixed input rather than a one-file assertion. Pin both sides
# of the filter: the known ADR must be present, the known Reference must be absent, and every
# reported file must carry the canonical ADR type.
step_json "LCLI-299 AC1: lore validate --type scopes a mixed bundle to ADR concepts" \
  '.kind == "validate.report"
   and .data.errorCount == 0
   and (.data.files | length) >= 1
   and all(.data.files[]; .type == "ADR")
   and ([.data.files[].path] | index("'"${DOC_PATH[ADR]}"'") != null)
   and ([.data.files[].path] | index("'"${DOC_PATH[Reference]}"'") == null)' \
  -- lore validate --type ADR --json
cp "$BROKEN_FIXTURES/missing-type.md" docs/reference/e2e-broken-missing-type.md
step "lore validate: catches a missing type: (documented hard error)" 6 \
  -- lore validate docs/reference/e2e-broken-missing-type.md
rm -f docs/reference/e2e-broken-missing-type.md

# LORE-66 AC4: `validate --strict` (promote any warning to a gate failure) was never exercised --
# an unrecognized frontmatter key is a tier-3 WARNING (never a bare-run error), exactly the class
# --strict exists to promote.
STRICT_PROBE_OUT="$(lore new Reference "E2E validate --strict probe" --json)"
STRICT_PROBE_PATH="$(echo "$STRICT_PROBE_OUT" | jq -r '.data.path')"
check "AC4: seeded the --strict probe doc" '[ -f "$STRICT_PROBE_PATH" ]'
sed -i '/^type:/a e2e_unknown_key: probe-value' "$STRICT_PROBE_PATH"
step_json "AC4: bare validate reports the unknown-key warning but stays a clean run (no --strict)" \
  '.data.warningCount >= 1 and .data.errorCount == 0' -- lore validate "$STRICT_PROBE_PATH" --json
step "AC4: the SAME bare validate exits 0 (a warning alone never gates)" 0 \
  -- lore validate "$STRICT_PROBE_PATH"
step "AC4: validate --strict promotes the SAME warning to a gate failure (exit 6)" 6 \
  -- lore validate "$STRICT_PROBE_PATH" --strict
rm -f "$STRICT_PROBE_PATH"

# ── Phase 9: check — the drift-gate loop ─────────────────────────────────────
# `check`'s positional args are bundle roots, not individual files. Run the reconciliation drift
# loop from the actual bundle root so `docs/index.md` supplies `okf_version: 0.2`; treating
# `docs/stories` as a standalone root would intentionally select legacy-missing 0.1 semantics.
# `sync` takes a concept id, same as phase 4 above.
step "lore check: clean bundle" 0 -- lore check
cp "$BROKEN_FIXTURES/dangling-link.md" docs/reference/e2e-broken-dangling-link.md
step "lore check: catches a dangling link" 6 -- lore check docs/reference
rm -f docs/reference/e2e-broken-dangling-link.md
step "lore check: clean again once the broken doc is removed" 0 -- lore check

# Genuine Story task-status drift, healed by `lore sync` (the documented loop). Under OKF 0.2,
# lifecycle `status` is authored state and the Backlog rollup lives in `lore_task_status`.
sed -i 's/^lore_task_status: .*/lore_task_status: todo/' "$STORY_PATH" || true
step "lore check: catches real Story status drift" 6 -- lore check
step "lore sync: heals the drift" 0 -- lore sync "$STORY_ID"
step "lore check: clean again after healing" 0 -- lore check

# LORE-63 AC2: managed-BLOCK BODY drift -- the other half of check's drift detection, never
# exercised before now (the only induction above is a frontmatter sed). Corrupt a rendered status
# cell directly: "In Progress" (capital, TASK1's live Backlog status) only ever appears inside the
# block's own row, never in the (lowercased) frontmatter `lore_task_status:` value, so this touches
# only the block body, not the frontmatter drift check just healed above.
sed -i 's/In Progress/CORRUPTED-STATUS/' "$STORY_PATH" || true
step "lore check: catches managed-block BODY drift (distinct from frontmatter status drift)" 6 \
  -- lore check
step "lore sync: heals the managed-block body drift" 0 -- lore sync "$STORY_ID"
step "lore check: clean again after healing the block-body drift" 0 -- lore check

# ── Phase 9b: check --json F2 dual-stream (validation half), --external, multi-root (LORE-66 AC3/AC4) ──
# AC3: the F2 dual-stream shape (check.report on stdout PLUS an ErrorEnvelope on stderr, src/commands/
# check.ts:156-164) is already pinned for the not_found half by LORE-62/65's vanished/archived-task
# phases above. The validation half (a deferred reconciliation config error caught mid-check) has
# never been exercised: malform backlog/config.yml's statuses: the same way Phase 15c below does for
# `lore sync`, but against `lore check` here instead.
cp backlog/config.yml /tmp/config-yml-before-ac3-f2.yml
sed -i 's|^statuses:.*$|statuses: "not-a-list"|' backlog/config.yml || true
lore check docs/stories --json >/tmp/check-f2-out 2>/tmp/check-f2-err
CHECK_F2_RC=$?
check "AC3: check --json's F2 dual-stream shape on a deferred validation error: check.report still lands on stdout, AND a validation ErrorEnvelope lands on stderr, exit 6" \
  '[ "$CHECK_F2_RC" -eq 6 ] \
   && jq -e ".kind == \"check.report\"" /tmp/check-f2-out >/dev/null 2>&1 \
   && tail -n1 /tmp/check-f2-err | jq -e ".error_type == \"validation\"" >/dev/null 2>&1'
rm -f /tmp/check-f2-out /tmp/check-f2-err
cp /tmp/config-yml-before-ac3-f2.yml backlog/config.yml
rm -f /tmp/config-yml-before-ac3-f2.yml
step "AC3: lore check clean again after restoring backlog/config.yml" 0 -- lore check

# AC4: `check --external` (opt-in liveness probe) -- prove failures are ALWAYS advisory and NEVER
# gate, even when every probed URL fails (this container has no real internet egress, so a
# deliberately-bogus .test domain deterministically fails to connect either way).
EXTERNAL_PROBE_PATH="docs/reference/e2e-external-link-probe.md"
cat > "$EXTERNAL_PROBE_PATH" <<'EXTEOF'
---
type: Reference
title: E2E external link probe
summary: Probe doc for the --external liveness gate contract.
timestamp: 2024-01-01T00:00:00.000Z
---
# E2E external link probe

See [an unreachable external link](https://e2e-lore-liveness-probe.test/does-not-exist) for details.
EXTEOF
lore check docs/reference --json >/tmp/check-external-off.json 2>/dev/null
EXTERNAL_OFF_RC=$?
lore check docs/reference --external --json >/tmp/check-external-on.json 2>/dev/null
EXTERNAL_ON_RC=$?
check "AC4: --external liveness never changes the gate exit code (same as without it)" \
  '[ "$EXTERNAL_OFF_RC" -eq "$EXTERNAL_ON_RC" ]'
check "AC4: --external reports at least one dead/unreachable finding for the deliberately-broken URL" \
  'jq -e "(.data.externalFindings // []) | length >= 1" /tmp/check-external-on.json >/dev/null 2>&1'
check "AC4: without --external, no externalFindings are present at all" \
  'jq -e ".data.externalFindings == null" /tmp/check-external-off.json >/dev/null 2>&1'
rm -f /tmp/check-external-off.json /tmp/check-external-on.json "$EXTERNAL_PROBE_PATH"
step "AC4: lore check clean again after removing the external-link probe doc" 0 -- lore check docs/reference

# AC4: multi-root check (two positional bundle roots in one invocation) -- per-root isolation +
# bundle-label-prefixed findings, never exercised (every check call above scopes to at most one root).
cp "$BROKEN_FIXTURES/dangling-link.md" docs/reference/e2e-multiroot-broken.md
lore check docs/reference docs/adr --json >/tmp/check-multiroot.json 2>/dev/null
MULTIROOT_RC=$?
check "AC4: multi-root check exits 6 (the broken root's error still gates the whole run)" \
  '[ "$MULTIROOT_RC" -eq 6 ]'
check "AC4: the broken finding is attributed to the docs/reference root specifically (label-prefixed)" \
  'jq -e "[.data.findings[] | select(.file | startswith(\"docs/reference/\"))] | length >= 1" /tmp/check-multiroot.json >/dev/null 2>&1'
check "AC4: no finding is misattributed to the clean docs/adr root" \
  '! jq -e "[.data.findings[] | select(.file | startswith(\"docs/adr/\"))] | length > 0" /tmp/check-multiroot.json >/dev/null 2>&1'
rm -f docs/reference/e2e-multiroot-broken.md /tmp/check-multiroot.json
step "AC4: lore check clean again after removing the multi-root broken-link probe" 0 -- lore check docs/reference docs/adr

# ── Phase 10: orphans ────────────────────────────────────────────────────────
# Per orphans.ts's documented scope: ANY doc: label exempts a task from being
# reported, even one pointing at a nonexistent concept (that mismatch is
# `lore check`'s job, not orphans'). A genuine orphanTasks case needs a task
# with NO doc: label and no owning tasks: reference at all — TASK3 (seeded in
# phase 2) has never been linked to anything, so it qualifies as-is.
# LCLI-300 AC1: the hierarchy-aware path needs a real Backlog parent/subtask relation, not a
# hand-authored fixture. Link only the parent to the otherwise-empty multi-doc probe Story from
# Phase 4b; the child deliberately carries no doc: label of its own. `lore orphans` must inherit
# ownership through parentTaskId while still reporting TASK3, the existing fully-unlinked control.
ORPHAN_PARENT="$(backlog task create "E2E linked parent for orphans hierarchy" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
ORPHAN_CHILD="$(backlog task create --parent "$ORPHAN_PARENT" "E2E unlinked child of linked parent" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "LCLI-300 AC1: seeded a real Backlog parent and child task" \
  '[ -n "$ORPHAN_PARENT" ] && [ -n "$ORPHAN_CHILD" ]'
step_json "LCLI-300 AC1: link only the parent task to the probe Story" \
  '.data.tasks[] | select(.task == "'"$ORPHAN_PARENT"'") | .backRef == "added"' \
  -- lore link "$MULTI_STORY_ID" "$ORPHAN_PARENT" --json
ORPHAN_CHILD_LC="$(printf '%s' "$ORPHAN_CHILD" | tr 'A-Z' 'a-z')"
TASK3_LC="$(printf '%s' "$TASK3" | tr 'A-Z' 'a-z')"
step_json "LCLI-300 AC1: linked-parent child is not orphaned, fully-unlinked TASK3 still is" \
  '.kind == "orphans.report"
   and ((.data.orphanTasks // [] | map(.id | ascii_downcase) | index("'"$ORPHAN_CHILD_LC"'")) == null)
   and ((.data.orphanTasks // [] | map(.id | ascii_downcase) | index("'"$TASK3_LC"'")) != null)' \
  -- lore orphans --json
step_json "lore orphans: reports TASK3 (seeded, never linked to any doc)" \
  '.kind == "orphans.report" and (.data.orphanTasks // [] | length) >= 1' -- lore orphans --json
step "lore orphans --tasks-only runs cleanly" 0 -- lore orphans --tasks-only
check "lore orphans surfaces the never-linked TASK3" \
  'lore orphans --json 2>/dev/null | grep -qi "$TASK3"'
step_json "AC4: lore orphans --docs-only reports only danglingLinks (orphanTasks omitted)" \
  '.kind == "orphans.report" and (.data | has("orphanTasks") | not) and (.data | has("danglingLinks"))' \
  -- lore orphans --docs-only --json

# ── Phase 11: graph ───────────────────────────────────────────────────────────
step_json "lore graph (whole bundle, --json)" '.kind == "graph.export"' -- lore graph --json
step_json "lore graph <id>" '.kind == "graph.export"' -- lore graph "$STORY_ID" --json
step "lore graph --dot" 0 -- lore graph --dot
step_json "lore export --schema-version 1.0 emits a complete projection envelope" \
  '.kind == "projection.export"
   and .data.projectionSchemaVersion == "1.0"
   and .data.records[0].record == "manifest"
   and .data.records[-1].record == "trailer"
   and ([.data.records[].record] | index("concept") != null)
   and ([.data.records[].record] | index("task") != null)
   and ([.data.records[].record] | index("edge") != null)' \
  -- lore export --schema-version 1.0 --json

# ── Phase 12: query ───────────────────────────────────────────────────────────
step_json "lore query full-text" '.kind == "query.results"' -- lore query "archive" --json
step_json "lore query --type filter" '.kind == "query.results"' -- lore query --type Story --json
# LORE-66 AC4: --tag/--status/--field, --limit truncation, and zero-hits were never exercised.
# Each filter test asserts BOTH a real match and a real exclusion -- a doc that must NOT appear --
# so a silently-ignored/no-op filter (which would just return the whole unfiltered bundle) cannot
# pass by accident the way an inclusion-only assertion would.
step_json "AC4: lore query --tag genuinely filters (matches the tagged Spec, excludes an untagged Story)" \
  '.kind == "query.results" and (.data.hits | any(.id == "specs/e2e-custom-out-path")) and (.data.hits | any(.id == "'"$STORY_ID"'") | not)' \
  -- lore query --tag e2e-tag-alpha --json
step_json "AC4: lore query --field genuinely filters (matches a Spec, excludes a known Story)" \
  '.kind == "query.results" and (.data.hits | any(.id == "specs/e2e-custom-out-path")) and (.data.hits | any(.id == "'"$STORY_ID"'") | not)' \
  -- lore query --field type=Spec --json
# `--status` is the OKF lifecycle-status filter, not Lore's Backlog-derived task rollup. Seed a
# lifecycle value explicitly and prove sync left it independent from `lore_task_status`.
if grep -q '^status:' "$STORY_PATH"; then
  sed -i 's/^status: .*/status: stable/' "$STORY_PATH"
else
  sed -i '/^lore_task_status:/i status: stable' "$STORY_PATH"
fi
CURRENT_STORY_STATUS="stable"
check "AC4: seeded an OKF lifecycle status without disturbing the task rollup" \
  'grep -q "^status: stable" "$STORY_PATH" && grep -q "^lore_task_status:" "$STORY_PATH"'
# MULTI_STORY_ID (Phase 4b) was never itself reconciled (its own tasks: link was added then
# removed before any `lore sync` touched it), so it carries NO status: frontmatter field at all --
# a genuine negative control that can never coincidentally match any --status value.
step_json "AC4: lore query --status genuinely filters (matches the reconciled Story, excludes a never-reconciled one)" \
  '.kind == "query.results" and (.data.hits | any(.id == "'"$STORY_ID"'")) and (.data.hits | any(.id == "'"$MULTI_STORY_ID"'") | not)' \
  -- lore query --status "$CURRENT_STORY_STATUS" --json
step_json "AC4: lore query --limit truncates when more matches exist than the cap" \
  '.kind == "query.results" and .data.total >= 2 and .data.shown == 1 and .data.truncated == true' \
  -- lore query --type Story --limit 1 --json
# A hyphenated phrase tokenizes into its individual words ("not"/"a"/"real"/"term", all common
# English words that genuinely score > 0 against other docs) -- not a true zero-hit case. One
# unbroken nonsense token has no common substring for the tokenizer to split on.
step_json "AC4: lore query with zero hits is a normal exit 0, not an error" \
  '.kind == "query.results" and .data.total == 0 and (.data.hits | length) == 0' \
  -- lore query "zzznonexistentqqqxyzzy12345" --json

# ── Phase 13: context ─────────────────────────────────────────────────────────
step_json "lore context --max-tokens" '.kind == "context.export"' \
  -- lore context "$STORY_ID" --max-tokens 2000 --json

# ── Phase 14: replace ─────────────────────────────────────────────────────────
# LORE-66 AC1: the OLD version of this step matched NOTHING -- "archive orders" never appeared
# anywhere in the bundle, so totalMatches/filesChanged were both 0 and the "managed region
# untouched" check passed trivially. It also checked `lore:tasks` markers, a region
# core/replace.ts's MANAGED_MARKERS registry does NOT protect today (confirmed against source:
# only the `lore:index` listing block is registered; `lore:tasks` protection is aspirational
# doc-comment, not implemented) -- doubly vacuous. Seed a probe doc whose title IS the find
# phrase, then `lore sync` so the phrase also lands inside docs/reference/index.md's real managed
# lore:index block -- the one region replace actually protects -- giving this step a genuine
# match both inside and outside a managed region.
PHRASE_DOC_OUT="$(lore new Reference "archive orders" --json)"
PHRASE_DOC_PATH="$(echo "$PHRASE_DOC_OUT" | jq -r '.data.path')"
check "AC1: seeded the replace probe doc titled exactly the find phrase" '[ -f "$PHRASE_DOC_PATH" ]'
step "AC1: lore sync renders the probe doc's title into docs/reference/index.md's managed block" 0 \
  -- lore sync
REFERENCE_INDEX="docs/reference/index.md"
check "AC1: the find phrase now sits inside the reference index's managed lore:index block" \
  'grep -q "lore:index:begin" "$REFERENCE_INDEX" && grep -q "archive orders" "$REFERENCE_INDEX"'
BEFORE_INDEX="$(cat "$REFERENCE_INDEX")"
step_json "lore replace outside managed regions" \
  '.kind == "replace.result" and (.data.totalMatches >= 1) and (.data.filesChanged >= 1)' \
  -- lore replace "archive orders" "archive Orders" --json
AFTER_INDEX="$(cat "$REFERENCE_INDEX")"
check "AC1: the probe doc's OWN title was genuinely replaced (real match, outside any managed region)" \
  'grep -q "archive Orders" "$PHRASE_DOC_PATH"'
check "AC1: the reference index's managed lore:index block is BYTE-IDENTICAL after replace (genuinely protected, not coincidentally unmatched)" \
  '[ "$BEFORE_INDEX" = "$AFTER_INDEX" ]'

# --regex / --in: a capture-group substitution scoped to just the probe doc via --in.
step_json "AC1: replace --regex --in scopes a capture-group substitution to one file" \
  '.kind == "replace.result" and (.data.totalMatches >= 1) and (.data.files | length) == 1 and (.data.files[0].path == "'"$PHRASE_DOC_PATH"'")' \
  -- lore replace 'archive (Orders)' 'ARCHIVE-$1-REGEX' --regex --in "$PHRASE_DOC_PATH" --json
check "AC1: the regex substitution's capture group landed in the probe doc" \
  'grep -q "ARCHIVE-Orders-REGEX" "$PHRASE_DOC_PATH"'

# --dry-run: reports a genuine pending match without writing.
step_json "AC1: replace --dry-run reports a genuine match without writing" \
  '.data.dryRun == true and (.data.totalMatches >= 1)' \
  -- lore replace "ARCHIVE-Orders-REGEX" "DRYRUN-SHOULD-NOT-LAND" --dry-run --json
check "AC1: --dry-run wrote NOTHING -- the probe doc is unchanged" \
  '! grep -q "DRYRUN-SHOULD-NOT-LAND" "$PHRASE_DOC_PATH" && grep -q "ARCHIVE-Orders-REGEX" "$PHRASE_DOC_PATH"'

# invalid regex (usage, exit 2): an unterminated character class.
step_fail "AC1: replace --regex with an invalid pattern is a usage error (exit 2)" 2 \
  '.error_type == "usage"' \
  -- lore replace 'archive[' 'x' --regex --json

# ── Phase 15: rename ───────────────────────────────────────────────────────────
OLD_REF_ID="${DOC_ID[Reference]}"
OLD_REF_PATH="${DOC_PATH[Reference]}"
# LCLI-300 AC3: seed a real third-party inbound link whose visible text deliberately names the
# old id. The shared rewrite engine must still retarget it, and rename must surface the advisory on
# stderr. Capture both streams because the stable rename.result remains on stdout while warnings
# follow the CLI diagnostic contract on stderr.
printf '\nReview [%s](../%s.md) before the rename.\n' "$OLD_REF_ID" "$OLD_REF_ID" >> "$SPEC_PATH"
check "LCLI-300 AC3: seeded a rename inbound link whose display text names the old id" \
  'grep -qF "[$OLD_REF_ID](../$OLD_REF_ID.md)" "$SPEC_PATH"'
step_json "lore rename --dry-run (reports, moves nothing)" '.kind == "rename.result"' \
  -- lore rename "$OLD_REF_ID" "reference/e2e-renamed" --dry-run --json
check "dry-run rename did not move the file" '[ -f "$OLD_REF_PATH" ]'
lore rename "$OLD_REF_ID" "reference/e2e-renamed" --json >/tmp/lcli300-rename-out 2>/tmp/lcli300-rename-err
LCLI300_RENAME_RC=$?
check "lore rename (real move + inbound link repoint) returns rename.result" \
  '[ "$LCLI300_RENAME_RC" -eq 0 ] && jq -e ".kind == \"rename.result\"" /tmp/lcli300-rename-out >/dev/null 2>&1'
check "renamed file exists at the new path" '[ -f "docs/reference/e2e-renamed.md" ]'
check "old path no longer exists" '[ ! -f "$OLD_REF_PATH" ]'
check "LCLI-300 AC3: rename retargeted the stale-text link instead of leaving it dangling" \
  'grep -qF "[$OLD_REF_ID](../reference/e2e-renamed.md)" "$SPEC_PATH" \
   && ! grep -qF "[$OLD_REF_ID](../$OLD_REF_ID.md)" "$SPEC_PATH"'
check "LCLI-300 AC3: rename warns that the visible old id now points to the new id" \
  'grep -qF "warning: link text \"$OLD_REF_ID\" in $SPEC_PATH still names \"$OLD_REF_ID\", but its link now points to \"reference/e2e-renamed\"" /tmp/lcli300-rename-err'
rm -f /tmp/lcli300-rename-out /tmp/lcli300-rename-err

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
  'grep -q "^lore_task_status: in-progress" "$CUSTOM_STORY_PATH"'
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
cp .lore/config.toml /tmp/lore-config-original.toml
cat > .lore/config.toml <<'TOMLEOF'
[tracker]
backend = "backlog"

[reconcile.overrides]
Review = "done"
TOMLEOF
step_json "lore sync: [reconcile.overrides] Review->done takes precedence over flow position" \
  '.kind == "sync.result"' -- lore sync "$CUSTOM_STORY_ID" --json
check "Story status flips to done via the override (proves overrides win over flow position)" \
  'grep -q "^lore_task_status: done" "$CUSTOM_STORY_PATH"'

# A malformed override target (not one of todo/in-progress/done) is core/reconcile.ts's OWN
# validation (validateOverrides), distinct from a bare TOML syntax error -- fails loud the same way.
cat > .lore/config.toml <<'TOMLEOF'
[tracker]
backend = "backlog"

[reconcile.overrides]
Review = "not-a-real-status"
TOMLEOF
step_fail "exit 6: [reconcile.overrides] target must be a valid rollup status (validation)" 6 \
  '.error_type == "validation"' \
  -- lore sync "$CUSTOM_STORY_ID" --json
cp /tmp/lore-config-original.toml .lore/config.toml
rm -f /tmp/lore-config-original.toml

# Leave no induced state behind: the probe Story's on-disk `lore_task_status` still reads "done"
# from the override test above, which no longer matches TASK6's real "Review" status now that no
# override is active -- re-heal it against live data, then restore backlog/config.yml's original
# status flow so this phase's custom flow does not silently outlive it.
step "lore sync: re-heal the probe Story back to live data now the override is gone" 0 \
  -- lore sync "$CUSTOM_STORY_ID"
check "probe Story re-healed to in-progress (Review's flow-position classification, no override)" \
  'grep -q "^lore_task_status: in-progress" "$CUSTOM_STORY_PATH"'
cp /tmp/config-yml-original.yml backlog/config.yml
rm -f /tmp/config-yml-original.yml

# TASK6's own REAL Backlog status is still "Review" -- a status the just-restored default 3-status
# flow no longer recognizes and has no [reconcile.overrides] entry for either. Left alone, this is
# a dormant landmine: the first full-bundle reconciliation pass to touch this Story again (Phase
# 17a's unscoped `lore check`, LORE-68 AC3) fails loud (validation) trying to reconcile it --
# discovered by that guard's own first real run, the same way LORE-68's original bug was. Reset
# TASK6 to a status the default flow recognizes and re-sync so the probe Story's on-disk task
# status matches live data one final time -- completing the "leave no induced state behind"
# cleanup above.
step "backlog task edit: reset TASK6 off the now-unrecognized custom status Review" 0 \
  -- backlog task edit "$TASK6" --status "Done"
step "lore sync: re-heal the probe Story after TASK6's status reset" 0 \
  -- lore sync "$CUSTOM_STORY_ID"
check "probe Story settles to done (TASK6's real, now-default-flow-recognized status)" \
  'grep -q "^lore_task_status: done" "$CUSTOM_STORY_PATH"'

# ── Phase 16: supersede ────────────────────────────────────────────────────────
# LORE-66 AC2: the OLD version of this step gave the ADR under test zero real inbound links, so
# --rewrite-links reported rewroteLinks:false -- the inbound-repoint engine (core/rewrite.ts's
# rewriteInbound) never actually ran E2E. Seed a genuine inbound body link in the Spec's body
# (Spec carries no managed block, LORE-59, so appending is safe) BEFORE superseding, so the
# rewrite has something real to repoint.
ADR_ID="${DOC_ID[ADR]}"
printf '\nSee [the ADR under test](../%s.md) for background.\n' "$ADR_ID" >> "$SPEC_PATH"
check "AC2: seeded a real inbound body link to the ADR in the Spec's body" \
  'grep -qF "../$ADR_ID.md" "$SPEC_PATH"'
# LCLI-300 AC2: add the contrasting stale-text form beside the ordinary-link control above. The
# retarget remains mandatory; the new contract is that the mismatch cannot pass silently.
printf '\nContrast [%s](../%s.md) with its successor.\n' "$ADR_ID" "$ADR_ID" >> "$SPEC_PATH"
check "LCLI-300 AC2: seeded a supersede inbound link whose display text names the old id" \
  'grep -qF "[$ADR_ID](../$ADR_ID.md)" "$SPEC_PATH"'

SUCCESSOR="$(lore new ADR "E2E successor decision" --json | jq -r '.data.id')"
step_json "lore supersede --dry-run" '.kind == "supersede.result"' \
  -- lore supersede "${DOC_ID[ADR]}" "$SUCCESSOR" --dry-run --json
lore supersede "${DOC_ID[ADR]}" "$SUCCESSOR" --rewrite-links --json >/tmp/lcli300-supersede-out 2>/tmp/lcli300-supersede-err
LCLI300_SUPERSEDE_RC=$?
check "lore supersede (real, rewrite-links) genuinely rewrites the Spec's inbound links" \
  '[ "$LCLI300_SUPERSEDE_RC" -eq 0 ] \
   && jq -e ".kind == \"supersede.result\" and .data.rewroteLinks == true" /tmp/lcli300-supersede-out >/dev/null 2>&1'
check "AC2: the Spec's inbound link now points at the successor, not the old ADR" \
  '! grep -qF "../$ADR_ID.md" "$SPEC_PATH" && grep -qF "../$SUCCESSOR.md" "$SPEC_PATH"'
check "LCLI-300 AC2: supersede retargeted the stale-text link too" \
  'grep -qF "[$ADR_ID](../$SUCCESSOR.md)" "$SPEC_PATH"'
check "LCLI-300 AC2: supersede warns that the visible old id now points to the successor" \
  'grep -qF "warning: link text \"$ADR_ID\" in $SPEC_PATH still names \"$ADR_ID\", but its link now points to \"$SUCCESSOR\"" /tmp/lcli300-supersede-err'
rm -f /tmp/lcli300-supersede-out /tmp/lcli300-supersede-err
step_fail "AC2: conflict-5 -- re-superseding the same already-superseded ADR fails loud" 5 \
  '.error_type == "conflict"' \
  -- lore supersede "$ADR_ID" "$SUCCESSOR" --json

# LORE-66 AC4: `graph --depth` was never exercised. The just-superseded ADR pair ($ADR_ID/$SUCCESSOR)
# is now genuinely connected by a real supersedes/superseded_by frontmatter edge (core/graph.ts's
# EdgeKind), so --depth 0 vs --depth 1 shows a real, non-coincidental radius difference.
step_json "AC4: lore graph <id> --depth 0 returns only the root node (no edges expanded)" \
  '.kind == "graph.export" and (.data.nodes | length) == 1 and (.data.nodes[0].id == "'"$ADR_ID"'") and (.data.edges | length) == 0' \
  -- lore graph "$ADR_ID" --depth 0 --json
step_json "AC4: lore graph <id> --depth 1 expands to include the successor via the supersedes/superseded_by edge" \
  '.kind == "graph.export" and (.data.nodes | length) >= 2 and ([.data.nodes[].id] | index("'"$SUCCESSOR"'") != null)' \
  -- lore graph "$ADR_ID" --depth 1 --json
step_fail "AC4: --depth without a root <id> is a usage error (exit 2)" 2 \
  '.error_type == "usage"' \
  -- lore graph --depth 2 --json

# `lore new ADR "E2E successor decision"` above (the supersede successor) scaffolded a new ADR
# without a follow-up sync, exactly the LCLI-377 gap `lore check`'s index-drift finding now
# catches: adr/index.md still lists only the pre-successor ADRs. Nothing between here and Phase
# 17a's first full unscoped check heals it otherwise, and Phase 17a asserts a genuinely clean
# bundle (LORE-68 AC3) -- so sync here, not to appease the new check, but because that IS the
# correct real-world remedy `lore check`'s hint already names.
step_json "lore sync: heal the ADR index left stale by Phase 16's unsynced `lore new`" \
  '.kind == "sync.result"' -- lore sync --json

# ── Phase 17: schema export ─────────────────────────────────────────────────────
step_json "lore schema export" '.kind == "schema.result"' -- lore schema export --json
for T in epic story spec adr runbook reference attested-computation; do
  check "schema export produced valid JSON for $T" "jq -e . .lore/schemas/${T}.schema.json >/dev/null 2>&1"
done

# LCLI-299 AC2/AC3: isolate both scoping probes from the managed default schema directory. The
# structured file lists prove where lore says it wrote; the filesystem assertions independently
# prove the exact files exist and contain valid JSON. Teardown names every created file explicitly.
LCLI299_TYPE_OUT=".lore/lcli-299-type-schemas"
check "LCLI-299 AC2: single-type schema probe starts from an absent directory" \
  '[ ! -e "$LCLI299_TYPE_OUT" ]'
step_json "LCLI-299 AC2: schema export --type writes exactly the Story schema" \
  '.kind == "schema.result"
   and .data.out == "'"$LCLI299_TYPE_OUT"'"
   and .data.count == 1
   and (.data.removed | length) == 0
   and ([.data.files[].path] == ["'"$LCLI299_TYPE_OUT"'/story.schema.json"])' \
  -- lore schema export --type Story --out "$LCLI299_TYPE_OUT" --json
check "LCLI-299 AC2: single-type output contains only one valid Story schema" \
  '[ "$(find "$LCLI299_TYPE_OUT" -maxdepth 1 -type f -name "*.schema.json" | wc -l)" -eq 1 ] \
   && jq -e . "$LCLI299_TYPE_OUT/story.schema.json" >/dev/null 2>&1'

LCLI299_CUSTOM_OUT=".lore/lcli-299-custom-schemas"
check "LCLI-299 AC3: custom-output schema probe starts from an absent directory" \
  '[ ! -e "$LCLI299_CUSTOM_OUT" ]'
step_json "LCLI-299 AC3: schema export --out writes the full profile outside the default directory" \
  '.kind == "schema.result"
   and .data.out == "'"$LCLI299_CUSTOM_OUT"'"
   and .data.count == 7
   and (.data.removed | length) == 0
   and (([.data.files[].path] | sort) == [
     "'"$LCLI299_CUSTOM_OUT"'/adr.schema.json",
     "'"$LCLI299_CUSTOM_OUT"'/attested-computation.schema.json",
     "'"$LCLI299_CUSTOM_OUT"'/epic.schema.json",
     "'"$LCLI299_CUSTOM_OUT"'/reference.schema.json",
     "'"$LCLI299_CUSTOM_OUT"'/runbook.schema.json",
     "'"$LCLI299_CUSTOM_OUT"'/spec.schema.json",
     "'"$LCLI299_CUSTOM_OUT"'/story.schema.json"
   ])
   and all(.data.files[]; (.path | startswith(".lore/schemas/") | not))' \
  -- lore schema export --out "$LCLI299_CUSTOM_OUT" --json
for T in epic story spec adr runbook reference attested-computation; do
  check "LCLI-299 AC3: custom output produced valid JSON for $T" \
    "jq -e . '$LCLI299_CUSTOM_OUT/${T}.schema.json' >/dev/null 2>&1"
done

rm -f "$LCLI299_TYPE_OUT/story.schema.json"
rmdir "$LCLI299_TYPE_OUT"
for T in epic story spec adr runbook reference attested-computation; do
  rm -f "$LCLI299_CUSTOM_OUT/${T}.schema.json"
done
rmdir "$LCLI299_CUSTOM_OUT"
check "LCLI-299 AC4: schema scoping probe teardown removed both exact output directories" \
  '[ ! -e "$LCLI299_TYPE_OUT" ] && [ ! -e "$LCLI299_CUSTOM_OUT" ]'

# ── Phase 17a: full unscoped `lore check` regression guard (LORE-68 AC3) ────────
# Nothing before this point ever ran a full, unscoped `lore check` over the whole bundle: every
# earlier `lore check` invocation (Phase 9's drift loop, the scoped checks elsewhere) targets a
# narrow path or doesn't assert a clean result. That gap is exactly how LORE-68's broken-link
# regression went undetected through the whole first campaign: Phase 15b's linked-Story rename
# silently dropped one `../` segment from the managed task block's link to `backlog/tasks/…`
# (src/core/rewrite.ts's outbound-link recompute resolved it in the bundle-relative coordinate
# space instead of the repo-relative one `normalizeLink` requires -- the two only coincide for a
# link that stays inside the bundle, so a link escaping it into `backlog/` was silently
# truncated). A full, unscoped, zero-findings check right here -- after Phase 17's schema export
# and before Phase 17b's profile-subsystem probe touches anything further -- is now permanent so
# this class of regression cannot silently recur.
step_json "full unscoped lore check is clean (Phase 15b's linked rename included)" \
  '.data.errorCount == 0 and .data.warningCount == 0' \
  -- lore check --json

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
sed -i '/^type:/a owner: jeremy' "$CUSTOM_PATH"
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
# command fail loud at exit 6, validation. LORE-89 made `lore check` one of those commands too:
# check.ts:47 imports loadProfile and runCheck (~line 142) calls it up front -- before bundle
# discovery or any other work -- deliberately mirroring context.ts/graph.ts's own LORE-84
# precedent of failing loud on a malformed profile before anything downstream runs. So a
# malformed profile now makes `lore check --json` fail the same way lore new/validate/sync
# already do below: exit 6, `.error_type == "validation"`, empty stdout -- asserted the same
# way via step_fail so the assertion genuinely fails if this fail-loud contract ever regresses
# to profile-blind.

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
step_fail "AC4: exit 6 malformed profile (zero [[types]]) via lore check" 6 \
  '.error_type == "validation"' \
  -- lore check --json

cp /tmp/profile-toml-good.toml .lore/profile.toml
rm -f /tmp/profile-toml-good.toml /tmp/custom-new-err
step_json "profile restored: lore schema export succeeds again (loadProfile recovers)" \
  '.kind == "schema.result"' -- lore schema export --json

# Leave no induced state behind (LORE-63's convention): a custom profile.toml REPLACES the
# default seven-type vocabulary wholesale, and a full `lore schema export` PRUNES any
# *.schema.json whose type the active profile no longer declares -- so both schema exports
# above already pruned Phase 17's seven default schema files. Deleting the custom profile and
# re-exporting once more (now back on the zero-config default) regenerates the seven defaults
# AND prunes the orphaned custom one in the same step, leaving Phase 18+ the bundle state they
# already expect.
rm -f .lore/profile.toml .lore/templates/e2e-custom-type.md
step_json "profile removed: lore schema export regenerates the seven default schemas" \
  '.kind == "schema.result"' -- lore schema export --json
check "the orphaned custom schema was pruned on the default-profile re-export" \
  '[ ! -f .lore/schemas/e2e-custom-type.schema.json ]'
for T in epic story spec adr runbook reference attested-computation; do
  check "default schema for $T restored after the profile subsystem probe" \
    "jq -e . .lore/schemas/${T}.schema.json >/dev/null 2>&1"
done

# The custom-type doc itself (docs/e2e-custom-type/e2e-custom-type-doc.md) is deliberately NOT
# deleted -- unlike the custom profile/template above, it stays so later phases keep exercising a
# genuine unknown-type warning under the default profile. But `lore new` never scaffolded it into
# any index, and this whole custom-profile excursion never synced, so both the bundle root index
# (a brand-new top-level directory) and this new directory's own index are stale (LCLI-377). Heal
# it the same way Phase 16 did.
step_json "lore sync: heal the root + e2e-custom-type indexes left stale by this profile excursion" \
  '.kind == "sync.result"' -- lore sync --json

# ── Phase 18: scaffold mkdocs + a real build ────────────────────────────────────
step "lore scaffold mkdocs" 0 -- lore scaffold mkdocs
# LORE-66 AC4 (superseded by LORE-263): a bare re-run used to be an all-or-nothing conflict no
# matter what. LORE-263 made it idempotent-when-unchanged instead, matching `lore sync`'s own
# "0 files changed" no-op model: a bare re-run over a byte-identical on-disk scaffold is now a
# no-op (exit 0, no files written); only a genuinely HAND-MODIFIED generated file still hard-errors
# with a conflict (exit 5) naming that file and pointing at --force. --force is unchanged — it
# always overwrites, reporting the previously-existing files as "updated". An unknown target is
# still a usage error.
step_json "LORE-263 AC1: lore scaffold mkdocs re-run on an unchanged scaffold is a no-op (exit 0, no files written)" \
  '.kind == "scaffold.result" and (.data.files | length) == 0' \
  -- lore scaffold mkdocs --json
printf '\nhand-edited-marker: true\n' >>mkdocs.yml
step_fail "LORE-263 AC2: lore scaffold mkdocs re-run over a HAND-MODIFIED mkdocs.yml is still a conflict (exit 5)" 5 \
  '.error_type == "conflict" and (.message | contains("mkdocs.yml")) and (.hint | contains("--force"))' \
  -- lore scaffold mkdocs --json
check "the hand-edited mkdocs.yml was left untouched by the refused re-run" \
  'grep -q "hand-edited-marker" mkdocs.yml'
step_json "LORE-263 AC3: lore scaffold mkdocs --force overwrites the existing scaffold" \
  '.kind == "scaffold.result" and (.data.files | any(.action == "updated"))' \
  -- lore scaffold mkdocs --force --json
check "the hand-edited marker is gone once --force regenerated mkdocs.yml" \
  '! grep -q "hand-edited-marker" mkdocs.yml'
step_fail "lore scaffold with an unknown target is a usage error (exit 2)" 2 \
  '.error_type == "usage"' \
  -- lore scaffold bogus-target --json
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
# LORE-66 AC4: the other detail topics (sync/check/validation) were never exercised -- only linking.
step_json "AC4: lore instructions sync" '.kind == "instructions.text" and .data.topic == "sync"' \
  -- lore instructions sync --json
step_json "AC4: lore instructions check" '.kind == "instructions.text" and .data.topic == "check"' \
  -- lore instructions check --json
step_json "AC4: lore instructions validation" '.kind == "instructions.text" and .data.topic == "validation"' \
  -- lore instructions validation --json
step_fail "AC4: lore instructions with an unknown topic is not_found (exit 3)" 3 \
  '.error_type == "not_found"' \
  -- lore instructions bogus-topic-xyz --json

# ── Phase 22: agents ─────────────────────────────────────────────────────────────
step_json "lore agents" '.kind == "agents.result"' -- lore agents --json
check "SKILL.md regenerated" '[ -f .claude/skills/lore/SKILL.md ]'

# LORE-66 AC4: --check/--force were never exercised (agents.ts's own drift gate: --check RETURNS
# exit 6 with the report still on stdout, never throws -- a hand-edited SKILL.md is left
# "protected" without --force).
step_json "AC4: lore agents --check is clean right after a fresh generation" \
  '.kind == "agents.result" and (.data.files | all(.action == "unchanged"))' \
  -- lore agents --check --json

printf '\nHAND-EDITED-MARKER\n' >> .claude/skills/lore/SKILL.md
lore agents --check --json >/tmp/agents-check-drift.json 2>/dev/null
AGENTS_CHECK_DRIFT_RC=$?
check "AC4: lore agents --check detects the hand-edited SKILL.md (exit 6 by RETURN, report still on stdout)" \
  '[ "$AGENTS_CHECK_DRIFT_RC" -eq 6 ] \
   && jq -e ".kind == \"agents.result\"" /tmp/agents-check-drift.json >/dev/null 2>&1 \
   && jq -e "[.data.files[] | select(.path == \".claude/skills/lore/SKILL.md\")][0].action == \"protected\"" /tmp/agents-check-drift.json >/dev/null 2>&1'
rm -f /tmp/agents-check-drift.json

step "AC4: plain lore agents (no --check, no --force) exits 0 and leaves the hand-edit untouched" 0 -- lore agents
check "AC4: the hand-edit is STILL present after a plain (non-force) run (protected, not overwritten)" \
  'grep -q "HAND-EDITED-MARKER" .claude/skills/lore/SKILL.md'

step_json "AC4: lore agents --force overwrites the protected, hand-edited SKILL.md" \
  '.kind == "agents.result" and ([.data.files[] | select(.path == ".claude/skills/lore/SKILL.md")][0].action == "updated")' \
  -- lore agents --force --json
check "AC4: the hand-edit is GONE after --force regenerated SKILL.md" \
  '! grep -q "HAND-EDITED-MARKER" .claude/skills/lore/SKILL.md'
step_json "AC4: lore agents --check is clean again after --force healed the drift" \
  '.kind == "agents.result" and (.data.files | all(.action == "unchanged"))' \
  -- lore agents --check --json

# CLAUDE.md nudge-block preservation: hand-written prose OUTSIDE the <!-- lore:agents:begin/end -->
# block must survive a heal cycle byte-for-byte, while drift INSIDE the block is regenerated. The
# nudge is never --force-gated (only SKILL.md is), so a plain `lore agents` heals it.
sed -i '/<!-- lore:agents:begin -->/i AC4-CUSTOM-PROSE-BEFORE-THE-BLOCK' CLAUDE.md
sed -i '/<!-- lore:agents:end -->/a AC4-CUSTOM-PROSE-AFTER-THE-BLOCK' CLAUDE.md
sed -i '/<!-- lore:agents:begin -->/,/<!-- lore:agents:end -->/ s/Skill:/CORRUPTED-SKILL-LABEL:/' CLAUDE.md
check "AC4: seeded custom prose around, and corrupted a line inside, the CLAUDE.md nudge block" \
  'grep -q "AC4-CUSTOM-PROSE-BEFORE-THE-BLOCK" CLAUDE.md && grep -q "AC4-CUSTOM-PROSE-AFTER-THE-BLOCK" CLAUDE.md && grep -q "CORRUPTED-SKILL-LABEL:" CLAUDE.md'
lore agents --check --json >/tmp/agents-check-nudge-drift.json 2>/dev/null
AGENTS_NUDGE_DRIFT_RC=$?
check "AC4: lore agents --check detects the corrupted CLAUDE.md nudge block as drift (exit 6)" \
  '[ "$AGENTS_NUDGE_DRIFT_RC" -eq 6 ] \
   && jq -e "[.data.files[] | select(.path == \"CLAUDE.md\")][0].action != \"unchanged\"" /tmp/agents-check-nudge-drift.json >/dev/null 2>&1'
rm -f /tmp/agents-check-nudge-drift.json

step "AC4: plain lore agents heals the corrupted nudge block" 0 -- lore agents
check "AC4: the hand-written prose BEFORE and AFTER the block survived byte-for-byte" \
  'grep -q "AC4-CUSTOM-PROSE-BEFORE-THE-BLOCK" CLAUDE.md && grep -q "AC4-CUSTOM-PROSE-AFTER-THE-BLOCK" CLAUDE.md'
check "AC4: the corrupted line INSIDE the block was regenerated back to the real content" \
  '! grep -q "CORRUPTED-SKILL-LABEL:" CLAUDE.md && grep -q "Skill:" CLAUDE.md'
step_json "AC4: lore agents --check is clean again after healing the nudge block" \
  '.kind == "agents.result" and (.data.files | all(.action == "unchanged"))' \
  -- lore agents --check --json

# ── Phase 22b: agent-context pack through the COMPILED binary (ODOC-63.1) ────────
# Consumer-surface regression guard for `lore agent context`. Unit tests cover the
# compileAgentContext source seam; a stale or mis-packaged platform binary can still
# accept .lore/agents/*.toml while emitting EMPTY section bodies (contentDigest =
# sha256 of "" = e3b0c442...) or dropping existing heading anchors. The `lore` on PATH
# here is the real compiled artifact this image built (Dockerfile: bun build --compile),
# so these steps fail in CI if the packaging path ever regresses to that behavior.
# Throwaway fixture concepts/profiles are torn down at the end of the phase, leaving
# the bundle pristine for later phases (LORE-63's leave-no-induced-state convention).
mkdir -p .lore/agents docs/e2e-agent-profile
cat > docs/e2e-agent-profile/e2e-agent-arch.md <<'ODOCDOCFENCE'
---
type: Reference
title: E2E Agent Architecture
summary: Scratch concept for the packed agent-profile surface check.
tags: [e2e]
---
# E2E Agent Architecture

Pinned rule body for the packed-surface regression.

## Must Keep

Never expose credentials in an agent context pack body.
ODOCDOCFENCE
cat > docs/e2e-agent-profile/e2e-agent-notes.md <<'ODOCDOCFENCE'
---
type: Reference
title: E2E Agent Notes
summary: Ranked scratch source for the packed agent-profile surface check.
tags: [e2e]
---
# E2E Agent Notes

Ranked source content about checkout form validation errors.
ODOCDOCFENCE
cat > .lore/agents/e2e-pack-surface.toml <<'ODOCDOCFENCE'
schema_version = 1
name = "e2e-pack-surface"
description = "Packed-surface e2e profile; throwaway fixture."
kind = "specialist"
max_tokens = 4000
pinned = ["e2e-agent-profile/e2e-agent-arch#must-keep"]
sources = ["e2e-agent-profile/e2e-agent-notes"]
ODOCDOCFENCE

step_json "ODOC-63.1: lore agent list (compiled binary) reports the fixture profile" \
  '.kind == "agent.profiles" and ([.data.profiles[] | select(.name == "e2e-pack-surface")] | length) == 1' \
  -- lore agent list --json

step_json "ODOC-63.1: lore agent show (compiled binary) resolves pinned and source references" \
  '.kind == "agent.profile"
   and (.data.pinned | index("e2e-agent-profile/e2e-agent-arch#must-keep")) != null
   and (.data.sources | index("e2e-agent-profile/e2e-agent-notes")) != null' \
  -- lore agent show e2e-pack-surface --json

step_json "ODOC-63.1: lore agent context (compiled binary) compiles a non-empty pack with real digests" \
  '.kind == "agent.context.export"
   and ((.data.pinned | length) > 0)
   and ((.data.pinned[0].body | length) > 0)
   and (.data.pinned[0].body | contains("Never expose credentials"))
   and (.data.pinned[0].contentDigest | test("^sha256:[a-f0-9]{64}$"))
   and (.data.pinned[0].contentDigest != "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
   and (.data.packDigest | test("^sha256:[a-f0-9]{64}$"))
   and (.data.tokenEstimate > 0)' \
  -- lore agent context e2e-pack-surface --task "checkout form validation errors" --json

# Negative: a bogus heading anchor must fail loud (exit 6, validation) through the
# packed binary, not be silently dropped from the pack.
cat > .lore/agents/e2e-pack-bad.toml <<'ODOCDOCFENCE'
schema_version = 1
name = "e2e-pack-bad"
description = "Deliberately bad heading anchor for the packed-surface check."
kind = "specialist"
pinned = ["e2e-agent-profile/e2e-agent-arch#not-a-real-heading"]
ODOCDOCFENCE
step_fail "ODOC-63.1: bogus heading anchor is rejected (exit 6, validation) by the compiled binary" 6 \
  '.error_type == "validation"' \
  -- lore agent show e2e-pack-bad --json
rm -f .lore/agents/e2e-pack-bad.toml .lore/agents/e2e-pack-surface.toml
rm -f docs/e2e-agent-profile/e2e-agent-arch.md docs/e2e-agent-profile/e2e-agent-notes.md
rmdir docs/e2e-agent-profile 2>/dev/null || true

step_json "ODOC-63.1 teardown: fixture profile removed, agent list empty again" \
  '.kind == "agent.profiles" and ((.data.profiles | length) == 0)' \
  -- lore agent list --json
check "ODOC-63.1 teardown: fixture concept files removed" \
  '[ ! -d docs/e2e-agent-profile ]'

# ── Phase 23: help ────────────────────────────────────────────────────────────────
step_json "lore help --json (capability manifest)" '.kind == "help.manifest"' -- lore help --json
check "help manifest mentions sync and check" \
  'lore help --json | grep -qi "\"sync\"" && lore help --json | grep -qi "\"check\""'
step_json "AC4: lore help <command> (positional) scopes the manifest to one command" \
  '.kind == "help.manifest" and (.data.commands | length) == 1 and (.data.commands[0].name == "sync")' \
  -- lore help sync --json
step_fail "AC4: lore help with an unknown command is not_found (exit 3)" 3 \
  '.error_type == "not_found"' \
  -- lore help bogus-command-xyz --json

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
cp .lore/config.toml /tmp/lore-config-good.toml
printf 'key = "unterminated\n' > .lore/config.toml
step_fail "exit 6: validation (error_type=validation ErrorEnvelope, distinct from drift)" 6 \
  '.error_type == "validation"' \
  -- lore sync "$STORY_ID" --json
cp /tmp/lore-config-good.toml .lore/config.toml
rm -f /tmp/lore-config-good.toml

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
# LORE-66 AC5 (housekeeping): the OLD version of this check only asserted exit 0 -- piped output
# could still carry raw ANSI escapes and this step would still pass. Assert the piped output is
# genuinely escape-free (bash pattern match on a literal ESC byte, no external regex dependency).
AUTO_PLAIN_OUT="$(lore query "archive" | cat)"
ESC_CHAR="$(printf '\033')"
check "AC5: piped output is genuinely ANSI-free (auto-plain), not just exit 0" \
  '[ "${AUTO_PLAIN_OUT#*$ESC_CHAR}" = "$AUTO_PLAIN_OUT" ]'
step "--plain explicit flag" 0 -- lore query "archive" --plain

# ── Phase 24b: nested checkout — the --show-prefix translation (LORE-65 AC4) ────────────────
# porcelainPaths' `git rev-parse --show-prefix` translation (src/state.ts) is dead in every phase
# above: /workspace is git-init'd as the top level itself (Phase 1), so cwd == the repo root and the
# prefix is always "". Build a small, fully separate fixture: an OUTER git repo with the lore+backlog
# project nested one directory down, so a real non-empty prefix actually exercises the translation
# this harness would otherwise never touch. `lore`'s own root is always cwd (src/cli.ts: `root =
# context.cwd || process.cwd()`, never a git-toplevel walk), so a project nested under a foreign git
# root is a fully realistic, supported configuration, not an edge case lore itself creates.
NESTED_OUTER=/tmp/nested-e2e/outer-repo
NESTED_PROJECT="$NESTED_OUTER/nested-project"
mkdir -p "$NESTED_PROJECT"
(cd "$NESTED_OUTER" && git init -q)
check "AC4: outer git repo initialized ABOVE the lore project directory" '[ -d "$NESTED_OUTER/.git" ]'

step "AC4: backlog init inside the nested project dir" 0 \
  -- bash -c "cd '$NESTED_PROJECT' && backlog init 'nested-e2e' --defaults"
step "AC4: configure backlog inside the nested project dir" 0 \
  -- bash -c "cd '$NESTED_PROJECT' && backlog config set autoCommit false && backlog config set remoteOperations false && backlog config set checkActiveBranches false"
step "AC4: lore init inside the nested project dir" 0 \
  -- bash -c "cd '$NESTED_PROJECT' && lore init --tracker backlog"
check "AC4: git rev-parse --show-prefix from inside the nested project reports a NON-EMPTY prefix" \
  '[ "$(cd "$NESTED_PROJECT" && git rev-parse --show-prefix)" = "nested-project/" ]'

NESTED_TASK="$(cd "$NESTED_PROJECT" && backlog task create "Nested checkout probe task" 2>&1 | grep -oE 'Created task [^ ]+' | awk '{print $3}')"
check "AC4: seeded a real task inside the nested project" '[ -n "$NESTED_TASK" ]'
NESTED_STORY_OUT="$(cd "$NESTED_PROJECT" && lore new Story "E2E nested checkout probe Story" --json)"
NESTED_STORY_ID="$(echo "$NESTED_STORY_OUT" | jq -r '.data.id')"
check "AC4: seeded a real Story inside the nested project" '[ -n "$NESTED_STORY_ID" ] && [ "$NESTED_STORY_ID" != "null" ]'

step_json "AC4: lore link succeeds under a non-empty --show-prefix (real per-write backlog/ commit)" \
  '.data.backlogCommit.committed == true' \
  -- bash -c "cd '$NESTED_PROJECT' && lore link '$NESTED_STORY_ID' '$NESTED_TASK' --json"
# This per-write commit is the OUTER repo's very first commit (no parent) -- `git diff-tree HEAD`
# alone shows nothing for a root commit unless told to diff it against the empty tree (`--root`).
check "AC4: the link's per-write commit landed in the OUTER repo's history, scoped to nested-project/backlog/ only" \
  'AC4_FILES="$(cd "$NESTED_OUTER" && git diff-tree --no-commit-id --name-only -r --root HEAD)"; [ -n "$AC4_FILES" ] && ! printf "%s\n" "$AC4_FILES" | grep -qv "^nested-project/backlog/"'

# The per-write commit above is deliberately scoped to only what `link` touched (ADR-0012 §1) --
# backlog/config.yml (written earlier by `backlog init`, never swept by a per-write commit) is still
# legitimately uncommitted at this point. `lore sync`'s CATCH-ALL sweep (commitBacklogIfDirty, the
# OTHER call site through porcelainPaths' --show-prefix translation) is what proves the nested
# prefix-stripping also works for the sweep path, not just the per-write one.
step_json "AC4: lore sync's catch-all sweep also succeeds under a non-empty --show-prefix" \
  '.data.backlogCommit.committed == true' \
  -- bash -c "cd '$NESTED_PROJECT' && lore sync --json"
step "AC4: git status is clean under the nested project's backlog/ after the sweep (no double-prefix pathspec miss)" 0 \
  -- bash -c "cd '$NESTED_PROJECT' && [ -z \"\$(git status --porcelain -- backlog/)\" ]"
rm -rf /tmp/nested-e2e

# LCLI-327: all commits above inherited their identity only through exported Git environment
# variables. Prove the disposable workspace's repository configuration never retained it.
check "LCLI-327: E2E identity was not persisted in the workspace Git config" \
  '! git config --local --get-regexp "^user\\.(name|email)$" >/dev/null 2>&1'

# ── Phase 24c: manifest-vs-emission cross-check (LCLI-365) ───────────────────────
# Every kind below is compared with NEITHER side a literal: the declared kind is read from
# `lore --json help` at run time, the emitted kind from the command's own envelope, both out of the
# same binary. Before this, the harness asserted `.kind == "orphans.report"` against real output
# while a unit test separately asserted the manifest says "orphans.report" -- two independent
# literals, each correct, with no edge between them. A handler could change and both be updated
# while the manifest went stale, and nothing would fail.
#
# Placed at the END on purpose: the bundle is fully built by here, so the read-only commands below
# run against known-good state and cannot disturb any earlier phase. The handful that mutate (`new`,
# `sync`, `schema`, `scaffold`) are ordered LAST, after every read-only assertion, and `new` is
# immediately followed by `sync` so the bundle is left clean again -- nothing in this file reads
# bundle content after this phase but Phase 25 is a tally, not a no-op, so this still isn't "read-only"
# top to bottom the way it was before LCLI-365 widened it.
#
# 16 of the manifest's 29 commands are covered here (8 pre-existing + 8 added by LCLI-365: `init`,
# `new`, `sync`, `tasks`, `context`, `instructions`, `schema`, `scaffold` -- each either takes no
# required argument or resolves against the bundle's one reserved, always-present concept, `index`).
# Not exhaustive, and deliberately so. Two groups stay uncovered rather than given a contrived
# invocation just to make a list look complete -- a case that has to be bent to fit tests the
# bending: commands the harness never runs at all (`backlog`, `snapshot`, `changed`, `provenance`,
# `explorer`, `agent`, `path`, `impact`), and commands the harness DOES run elsewhere but only
# against a specific target/task id this phase would have to fabricate (`replace`, `rename`,
# `supersede`, `link`, `unlink`). Widening either group is tracked on LCLI-365.
#
# `step_declared_kind check` below requires `lore check`'s own exit to be 0 -- it is asserting
# kind-matching, not bundle cleanliness, and a real index-drift error (LCLI-377) would make it
# fail for an unrelated reason. Phase 17a already owns "is the bundle clean" (LORE-68 AC3) and
# passes before this phase ever runs; CI found this exact interaction live -- two specific,
# now-fixed spots (Phase 16's unsynced ADR successor, Phase 17b's unsynced custom-type doc) plus
# at least one further accumulation between Phase 17a and here that direct tracing did not
# isolate. Rather than keep chasing individual sources one CI round-trip at a time, sync once
# here, defensively: this phase's own job is unaffected by whether the bundle happened to need
# one.
step_json "lore sync: defensive heal before the kind cross-check phase" \
  '.kind == "sync.result"' -- lore sync --json
step_declared_kind check        -- lore check --json
step_declared_kind validate     -- lore validate --json
step_declared_kind orphans      -- lore orphans --json
step_declared_kind graph        -- lore graph --json
step_declared_kind export       -- lore export --json
step_declared_kind query        -- lore query "orders" --json
step_declared_kind help         -- lore help --json
step_declared_kind agents       -- lore agents --check --json
step_declared_kind tasks        -- lore tasks index --json
step_declared_kind context      -- lore context index --json
step_declared_kind instructions -- lore instructions --json
step_declared_kind schema       -- lore schema export --json
step_declared_kind scaffold     -- lore scaffold mkdocs --json
step_declared_kind init         -- lore init --json
step_declared_kind new          -- lore new reference "LCLI-365 Phase 24c declared-kind smoke doc" --json
step_declared_kind sync         -- lore sync --json

# ── Phase 25: tally ───────────────────────────────────────────────────────────────
tally

# NON-VACUITY FLOOR (LCLI-360). A suite that runs FEWER cases than it should is the most
# dangerous way for this harness to fail, because it fails GREEN: `$FAIL -gt 0` is false when
# nothing ran, so a run that died early, skipped a whole phase, or lost its assertions would
# exit 0 and read as a clean sheet. That is exactly what happened when lib/steps.sh was missing
# from the image -- every helper became "command not found", nothing was recorded, and only the
# resulting non-zero from elsewhere saved it.
#
# So the run must prove it actually executed a plausible number of cases. This floor is a
# DELIBERATE, RATCHETING constant:
#   - Raise it when cases are added. That is the point -- it is what keeps the floor meaningful.
#   - NEVER lower it to make a red run green. A drop in case count is either a deletion someone
#     should have to justify in review, or a truncated run. Both deserve a failure, not an
#     accommodation.
# Set below the current total with headroom for ordinary churn, not at it, so removing one
# obsolete case does not fail the build while losing a whole phase still does.
MIN_EXPECTED_CASES="${MIN_EXPECTED_CASES:-330}"
assert_non_vacuous "$MIN_EXPECTED_CASES" || exit 1

# AC1: a report-write failure inside record()/check() (permission denied, disk
# full, ...) must flip the overall exit code too, not just a failed test --
# otherwise an all-PASS run whose report silently failed to write would still
# report success.
if [ "$FAIL" -gt 0 ] || [ "$REPORT_WRITE_FAILURES" -gt 0 ]; then
  exit 1
fi
exit 0
