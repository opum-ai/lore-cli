---
id: LCLI-269
title: >-
  docker/e2e/run-e2e.sh runs its destructive phases against the caller's cwd
  when invoked outside the container (no set -e, unguarded cd /workspace)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - build-ci-config
  - dx
  - docker-e2e
dependencies: []
priority: high
type: bug
ordinal: 371000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`docker/e2e/run-e2e.sh` should fail closed when it is not running inside its container, instead of silently continuing and mutating the caller's working directory.

## Observed
Hit for real during round 5, wave 1 (LCLI-267). A worker ran `bash docker/e2e/run-e2e.sh` directly on the host instead of through `docker compose`. The script:

- declares `set -uo pipefail` at **line 17** — deliberately **without `-e`** (line 34's own comment confirms the omission is intentional, so the harness can keep running after an individual assertion fails), and
- runs an **unguarded `cd /workspace`** at **line 163** (the only occurrence).

On a host `/workspace` does not exist, so the `cd` fails, the script does not stop, and every later phase executes against the caller's cwd. Concretely it:
- overwrote `backlog/config.yml`'s `project_name` (`lore` -> `lore-e2e`), stripping the ADR-0012 header comment,
- created **3 spurious real Backlog tasks** (LCLI-269/270/271) in `backlog/tasks/`,
- wrote stray `.lore/.gitignore`, `.lore/profile.toml`, `.lore/schemas/`, `.lore/templates/`, and `AGENTS.md` into the worktree.

All of it was uncommitted working-tree state and was fully reverted — nothing was staged, committed, or pushed, and the orchestrator independently verified the cleanup (no LCLI-269/270/271 anywhere, `backlog/config.yml` untouched on the branch, the committed diff exactly the 5 expected files). But the next person may not notice before committing.

## Why it matters
The correct invocation (`docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e`) is documented, but the script is executable and sitting right there, and its failure mode is **silent and destructive** rather than a clean error. It creates real Backlog tasks, which mints IDs and is exactly the shared-state mutation the campaign otherwise serializes carefully. Note `set -e` cannot simply be added — the harness relies on continuing past failed assertions — so the guard has to be local to the `cd`.

## Direction (decide in plan)
Fail closed at the `cd`, e.g. `cd /workspace || { echo "run-e2e.sh must run inside the e2e container; use docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e" >&2; exit 1; }`. Consider additionally asserting a container-only marker (e.g. `/.dockerenv`, or an env var set by the compose service) **before** any mutating phase, so the script refuses early rather than at the first `cd`. Check whether any other `cd` or path assumption in the script has the same shape.

## Refs
`docker/e2e/run-e2e.sh` (line 17 `set -uo pipefail`, line 34 comment, line 163 `cd /workspace`), `docker/e2e/docker-compose.yml` (service `e2e`), `docs/runbooks/docker-e2e-testing-environment.md`, LCLI-100 (made the harness a CI gate), LCLI-104 (exit-code propagation).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running run-e2e.sh outside its container exits non-zero with a clear message naming the correct docker compose invocation, before any phase that writes to the filesystem or invokes backlog
- [x] #2 The guard does not rely on 'set -e' (the harness intentionally omits it so it can continue past failed assertions) — verify the omission is preserved and the harness still reports all failing assertions rather than stopping at the first
- [x] #3 Any other unguarded cd or container-path assumption in the script is identified and either guarded or explicitly documented as safe
- [x] #4 The in-container path is unaffected: docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e still reports 302 passed / 0 failed and exit 0
- [x] #5 A host-side invocation is verified by hand to leave the working tree clean (git status --porcelain empty, no new backlog/tasks/ files, backlog/config.yml unmodified)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docker/e2e/Dockerfile: add `ENV LORE_E2E_CONTAINER=1` alongside RESULTS_DIR/LORE_REPO -- a
   purpose-built marker baked into the image, present only in containers built from this
   Dockerfile (compose service `e2e`).
2. docker/e2e/run-e2e.sh: immediately after `set -uo pipefail` (before RESULTS_DIR/REPORT are
   even created, before any mutating phase), add a fail-closed guard checking both
   LORE_E2E_CONTAINER=1 AND /workspace existing; on failure print a clear message naming the
   correct `docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e`
   invocation and `exit 1`. Does NOT add `set -e` -- the guard is a plain `if`, so the harness's
   existing continue-past-failed-assertions behavior (step/check/record) is untouched.
3. Also guard the literal `cd /workspace` at (originally) line 163 with `|| { echo ...; exit 1; }`
   as defense-in-depth / direct fix of the cited line.
4. Sweep: grep every other `cd` in the script (found at ~193, 1351-1352, 1543-1577) -- confirm
   each is either inside a subshell `(...)`/`$(...)` or `bash -c '...'` and `&&`-chained with the
   command that depends on it, so a cd failure there can only fail that one step/check (already
   reported via the harness's own PASS/FAIL machinery), never leak into continued execution
   against the wrong directory the way the bare top-level `cd /workspace` could. Document the
   sweep result in the script itself near the guard, and in task notes.
5. Sweep docs/runbooks/docker-e2e-testing-environment.md for stale prose -- add a short note
   documenting the new fail-closed guard against direct host invocation if nothing already covers
   it (currently the runbook is silent on running run-e2e.sh directly, not factually contradicted,
   but worth documenting for future contributors).
6. Verify AC4: docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e
   still reports 302 passed / 0 failed, exit 0 (in-container path unaffected).
7. Verify AC2: temporarily break two assertions (e.g. flip an expected exit code in two `step`
   calls), rerun in-container, confirm BOTH report FAIL and the tally still reflects both (not
   just the first) -- then revert.
8. Verify AC5: snapshot `git status --porcelain`, `ls backlog/tasks | wc -l`, `md5 backlog/config.yml`
   before and after running `bash docker/e2e/run-e2e.sh` directly on the host (safe now because of
   the guard) -- confirm all three are unchanged/empty and the script exits 1 with the guard
   message.
9. Add CHANGELOG [Unreleased] entry. Update task notes/final summary with objective evidence,
   mark Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation:
- docker/e2e/Dockerfile: added ENV LORE_E2E_CONTAINER=1 (purpose-built container marker, present
  only in images built from this file).
- docker/e2e/run-e2e.sh: added a fail-closed guard immediately after `set -uo pipefail` (before
  RESULTS_DIR/REPORT are even created, before any mutating phase) checking
  LORE_E2E_CONTAINER=1 AND /workspace existing; prints a clear message naming the correct
  `docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e` invocation
  and exits 1 if either signal is missing. Also guarded the literal `cd /workspace` line itself
  with `|| { echo ...; exit 1; }` as defense-in-depth. No `set -e` added anywhere.
- docs/runbooks/docker-e2e-testing-environment.md: added a Prerequisites bullet warning against
  direct invocation and documenting the new guard.
- CHANGELOG.md: added [Unreleased] entry.

AC3 sweep: grepped every `cd`/directory-change in run-e2e.sh besides the guarded top-level one.
Found 4 other sites (pre-init probe /tmp dir; docusaurus `cd website` x2; the nested-checkout
phase's outer-repo git init + several `bash -c "cd '$NESTED_PROJECT' && ..."` / `$(cd ... && ...)`
calls). Every one is inside a subshell `(...)`, a command substitution `$(...)`, or a `bash -c
'...'` child process, and always `&&`-chained to the command that depends on the cd succeeding.
None can leak a cd failure into continued execution against the wrong directory the way the bare
top-level `cd /workspace` could -- a failure there just fails that one step/check, already
reported by the harness's own PASS/FAIL accounting. Documented inline in the script (right after
the guard) and here. No other absolute/relative container-path assumption found that isn't either
an absolute path (safe regardless of cwd) or downstream of the now-guarded cd.

Verification (objective, all actually run):
- `bash -n docker/e2e/run-e2e.sh` -- syntax OK.
- AC1/host guard: `bash docker/e2e/run-e2e.sh` run directly on the host (in this worktree) prints
  the guard message and exits 1 (captured exit code: 1).
- AC5: snapshotted `git status --porcelain`, `ls backlog/tasks | wc -l` (285), and
  `md5 backlog/config.yml` (6826b029625f7c55dedaca208452931d) BEFORE and AFTER the host
  invocation above -- all three byte-identical; confirmed no new backlog/tasks/ files, no
  .lore/.gitignore, .lore/profile.toml, .lore/schemas/, .lore/templates/, or AGENTS.md appeared.
- AC2 (set -e absence): `grep -n "^set -" docker/e2e/run-e2e.sh` shows only `set -uo pipefail`.
- AC2 (continues past failures): temporarily flipped the expected exit code (0 -> 1) on two
  unrelated `step` assertions ("lore --help prints the banner", "lore -h (short flag) prints the
  banner"), rebuilt and ran `docker compose -f docker/e2e/docker-compose.yml up --build
  --exit-code-from e2e` -- both reported `[FAIL] ... (exit 0, expected 1)` by name, the run
  continued through all ~300 remaining checks, and the final tally was "300 passed, 2 failed"
  (container exit 1). Reverted both, rebuilt and re-ran -- back to "302 passed, 0 failed" (exit
  0).
- AC4: `docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e` (clean,
  before AND after the AC2 break/revert cycle) -- both runs: "==== E2E summary: 302 passed, 0
  failed ====", container exit code 0.
- `bun test`: 2181 pass, 0 fail (unchanged baseline). `bun run lint` (biome check .): clean, no
  fixes needed. `bun run src/cli.ts check docs/runbooks`: 7 files, 0 errors, 0 warnings (the
  runbook edit is OKF-clean).

Pre-merge polish pass (post-approval): fixed 3 falsifiable statements in this branch's new text, no behaviour change. (1) run-e2e.sh's AC3-sweep comment overreached — claimed every non-guarded cd's failure is reported as an ordinary step/check FAIL; carved out line 1614 (bare bash -c, status/output discarded via >/dev/null 2>&1, reported nowhere) and line 1643 (check '[ -z "$(cd ... && git status ...)" ]', a failed cd yields a vacuous PASS). The safety property (no cwd leak, no wrong-directory mutation) still holds at both and is stated as such. (2) CHANGELOG.md said the script's 'first real action was an unguarded cd /workspace'; corrected — git show dev:docker/e2e/run-e2e.sh shows mkdir -p "$RESULTS_DIR" and : > "$REPORT" both ran first (lines 24-25 pre-fix, cd at line 163). Commit 160984e's message is unchanged (can't rewrite pushed history). (3) docs/runbooks/docker-e2e-testing-environment.md's new bullet referenced the Steps section's docker compose command, which lacked --exit-code-from e2e while the guard message/compose header/CI (.github/workflows/ci.yml:197) all use it; added the flag to Steps section 1. Verified: bash -n clean; one docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e run = 302 passed, 0 failed, exit 0; bun run src/cli.ts check docs/runbooks = 7 files, 0 errors, 0 warnings. Consistency sweep found one pre-existing, explicitly-out-of-scope residual: the runbook's CI-gate paragraph still calls --exit-code-from e2e 'CI-specific', which is now slightly stale given the Steps-section fix; left untouched per orchestrator instruction (tracked separately, same paragraph as the LCLI-196 stale-prose item).

Fix-pass follow-up (post-approval, same branch):
- docs/runbooks/docker-e2e-testing-environment.md:36-37 — deleted the now-false "and `--exit-code-from e2e`" from the CI-specific-flags sentence. Steps §1 (line 70) now also uses --exit-code-from e2e, so only PUID/PGID remain CI-specific; the sentence contradicted Steps §1 before this fix.
- docker/e2e/run-e2e.sh:72 — fixed the carve-out citation from "line 1643's `check ...`" to "line 1642's `check ...`": the `check` keyword itself begins at 1642, 1643 is only its expression argument. Now consistent with the sibling citation at line 71, which names the `step` keyword line (1612).
Both are prose/comment-only; no executable line changed (verified via diff grep). bash -n clean, lore check docs/runbooks still 7 files/0 errors/0 warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed docker/e2e/run-e2e.sh's silent host-cwd-mutation footgun with a fail-closed container-only
guard, verified end-to-end rather than assumed:

- Guard: docker/e2e/Dockerfile now bakes in ENV LORE_E2E_CONTAINER=1; run-e2e.sh checks it plus
  /workspace's existence immediately after `set -uo pipefail` (before any mutating phase, before
  RESULTS_DIR/REPORT even exist) and exits 1 with the correct docker-compose invocation if either
  signal is missing. The literal `cd /workspace` line is separately guarded too (defense-in-depth).
- AC1/AC5 objective evidence: ran `bash docker/e2e/run-e2e.sh` directly on the host in this
  worktree -- printed the guard message, exit 1. git status --porcelain, `ls backlog/tasks | wc -l`
  (285), and `md5 backlog/config.yml` were identical before and after; no stray backlog tasks or
  .lore/*/AGENTS.md files appeared.
- AC2 objective evidence: `set -e` confirmed still absent (only `set -uo pipefail`). Temporarily
  broke two `step` assertions' expected exit codes, ran the real in-container harness via
  `docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e` -- both
  reported `[FAIL]` by name and the run continued through ~300 more checks to a final tally of
  "300 passed, 2 failed" (exit 1), proving the harness still reports every failure rather than
  stopping at the first. Reverted both; re-ran to confirm "302 passed, 0 failed" (exit 0) again.
- AC3 sweep: every other `cd` in the script (pre-init probe, docusaurus build x2, nested-checkout
  phase's several sites) is subshell/`bash -c`-scoped and `&&`-chained -- none share the
  bare-top-level-cd failure shape, none needed a guard; documented inline in the script and in
  task notes.
- AC4: `docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e` reports
  "302 passed, 0 failed", exit 0 -- run twice (before and after the AC2 break/revert cycle),
  confirming the in-container path is genuinely unaffected.
- Regression checks: `bun test` 2181/0 pass (unchanged baseline), `bun run lint` clean,
  `bun run src/cli.ts check docs/runbooks` 7 files/0 errors/0 warnings (the runbook prose addition
  is OKF-clean).
- docs/runbooks/docker-e2e-testing-environment.md gained a Prerequisites bullet warning against
  direct invocation and documenting the guard. CHANGELOG.md gained an [Unreleased] entry.
<!-- SECTION:FINAL_SUMMARY:END -->
