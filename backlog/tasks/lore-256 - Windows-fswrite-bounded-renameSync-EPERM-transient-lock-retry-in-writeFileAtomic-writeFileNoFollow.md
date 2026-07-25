---
id: LORE-256
title: >-
  Windows fswrite: bounded renameSync EPERM/transient-lock retry in
  writeFileAtomic/writeFileNoFollow
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 18:41'
updated_date: '2026-07-25 04:07'
labels:
  - cross-platform
  - build-ci-config
dependencies: []
references:
  - src/commands/fswrite.ts
priority: low
type: bug
ordinal: 358000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Harden the atomic write commit against transient Windows failures: writeFileAtomic and writeFileNoFollow finish with a write-temp-then-renameSync-over-destination, and on Windows that rename can intermittently fail with EPERM/EBUSY/EACCES when an antivirus scanner or the Search indexer holds a brief lock on the destination. Add a small bounded retry-with-backoff around the rename.

## Why it matters
LORE-252 fixed the deterministic Bun/Windows openSync ENOENT and turned the windows-latest CI leg green, but deliberately did NOT harden the rename step. Transient rename-over-existing locks are a real (if intermittent) failure mode for lore agents/sync/replace/schema/scaffold --force on end-user Windows machines, and could also flake CI. The canonical write-file-atomic library handles exactly this with a retry. Low priority: a hazard, not yet observed.

## Context
src/commands/fswrite.ts writeFileAtomic (~L288 renameSync) and writeFileNoFollow (~L773). Must preserve LORE-231 temp-leak guard, LORE-117 mode/ownership, LORE-130/92 symlink safety, and per-file atomicity. See LORE-252 (Done) for the primitive the rename now sits behind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 renameSync-over-existing in both writeFileAtomic and writeFileNoFollow retries a bounded number of times with backoff on the Windows transient-lock codes (EPERM/EBUSY/EACCES), then surfaces the failure via ioError if retries exhaust.
- [x] #2 The retry preserves every existing invariant: LORE-231 temp-leak guard, LORE-117 mode/ownership preservation, LORE-130/92 symlink safety, per-file rename atomicity.
- [x] #3 A test injects a transient rename failure that succeeds on a later attempt (deterministic, injected — not a real lock), and asserts no behavior change on POSIX.
- [ ] #4 windows-latest CI leg and the full suite stay green; typecheck and biome clean.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a small, self-contained retry helper (renameOverDestination) in fswrite.ts, placed right
   before writeFileAtomic (the module's first user), with a shared errno code set
   {EPERM,EBUSY,EACCES} and a bounded attempt count (4 total attempts = 1 + 3 retries) with
   exponential backoff (20ms, 40ms, 80ms; synchronous busy-wait via Date.now(), not
   Atomics.wait -- avoids relying on Atomics.wait's less-certain cross-platform/Bun-on-Windows
   behavior for a hazard this task treats as "not yet observed").
2. Replace the single `renameSync(tmpPath, absPath)` call in writeFileAtomic (~L335) and in
   writeFileNoFollow (~L821) with calls to the shared helper. Both call sites stay inside their
   existing try/catch: the LORE-231 temp-leak cleanup, LORE-117 mode/ownership preservation
   (already applied to the temp file BEFORE the rename, so retry only wraps the commit step and
   never re-runs those steps), and LORE-130/92 symlink refusal (unchanged -- happens before any
   temp-file I/O, nowhere near the rename) are all untouched. On retry exhaustion the raw errno
   error propagates unchanged to the existing outer catch, which classifies it via ioError exactly
   as before this task (EACCES/EPERM -> denied; anything ioError doesn't special-case, e.g. a
   persistent EBUSY, still propagates as an uncaught fault exactly as it did pre-LORE-256) --
   deliberately NOT touching ioError's own classification table, since that is shared by every
   other caller in this module and is out of this task's scope.
3. Tests (test/fswrite.test.ts): spy on fs.renameSync (mirroring the existing writeFileNoFollow
   fs.writeFileSync/fs.renameSync spy pattern already in this file) to throw a deterministic
   EBUSY/EPERM on the first N calls then delegate to the real renameSync -- proves both
   writeFileAtomic and writeFileNoFollow succeed after a transient failure, with the destination
   holding the final correct bytes and no stray temp file. A companion test proves retries exhaust
   into the SAME classified LoreError (denied) a persistent EACCES always produced pre-LORE-256 --
   i.e. no swallowed failure. One of the new tests is checked by reverting the production change
   and re-running to confirm it fails without the fix (regression-test sanity check per the
   finalization procedure). Existing suites (mode preservation, rollback, symlink refusal,
   crash-mid-write) are re-run unmodified to confirm no regression.
4. Verify: bun test, bun run typecheck, bun run lint, bun run src/cli.ts check. Do NOT run the
   docker e2e harness (sibling task owns it this wave).

Decision (no explicit "decide in plan" AC marker, recorded for traceability anyway): bounded
retry uses a platform-agnostic errno-code check (not gated on process.platform === "win32"),
since the task description frames EPERM/EBUSY/EACCES as "Windows transient-lock codes" but the
guard is cheap and harmless if a POSIX run ever hits one of these codes transiently; a PERSISTENT
POSIX failure still ends in the identical classified error, just after up to ~140ms of bounded
backoff, so the visible outcome (error type/exit code) is unchanged -- satisfying AC#3's "no
behavior change on POSIX" as a classification/outcome guarantee, not a zero-added-latency one.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: added a shared, unexported renameOverDestination(tmpPath, absPath) helper in
fswrite.ts (placed just before writeFileAtomic), wrapping the single commit renameSync call both
writeFileAtomic (~L423) and writeFileNoFollow (~L914) already had. Retries up to RENAME_MAX_ATTEMPTS
(4 total attempts) only on errno EPERM/EBUSY/EACCES, with exponential backoff (20ms/40ms/80ms, via a
synchronous Date.now() busy-wait -- chosen over Atomics.wait to avoid relying on unverified
Bun-on-Windows-CI main-thread behavior). Any other errno, or budget exhaustion, rethrows the raw
cause unchanged into each function's existing outer catch/ioError classification -- neither
function's catch block, temp-file creation, mode/ownership preservation, or symlink-refusal logic
was touched.

Verification evidence:
- bun test: 2116 pass / 0 fail across 48 files (test/fswrite.test.ts: 32 pass / 0 fail, up from 26
  pre-change -- 6 new LORE-256 tests added).
- bun run typecheck: clean (tsc --noEmit, no output).
- bun run lint: clean (biome check ., "Checked 111 files ... No fixes applied" after one
  auto-format pass on the new test block).
- bun run src/cli.ts check: "39 files, 0 errors, 0 warnings".
- Regression-test sanity check per task-execution procedure: temporarily reverted both call sites
  back to bare renameSync (sed, restored immediately after), reran just the LORE-256 describe block
  in isolation -- 4 of 6 new tests genuinely FAILED without the fix (the 2 transient-recovery tests
  threw on the first injected failure instead of retrying; the 2 persistent-failure tests observed
  only 1 renameSync call instead of the bounded 4), confirming they exercise real behavior, not
  tautologies. The 2 "no retry engaged on the ordinary success path" tests correctly still passed
  reverted (nothing to retry when renameSync never fails) -- restored the fix immediately after,
  reconfirmed full bun test green.
- Windows-latest CI leg (AC#4's other half) cannot be driven from this session (macOS worktree,
  no CI trigger available here) -- the retry-injection tests are platform-agnostic (spy on
  fs.renameSync directly, not gated by process.platform), so they will also execute on the
  windows-latest matrix leg once this branch's CI runs; that run is the objective evidence for the
  Windows-leg half of AC#4, to be confirmed at PR/merge time rather than from this worktree.

AC#4 status: left UNCHECKED deliberately. Its local-verifiable conjuncts are objectively confirmed
(bun test 2116/0 across 48 files, bun run typecheck clean, bun run lint/biome clean -- command
output above), but this repo's ci.yml only runs the matrix (including the windows-latest leg) on
`pull_request` or a push to `main`/workflow_dispatch -- NOT on an ordinary feature-branch push. This
worker's instructed procedure ends at `git push -u origin feature/LORE-256`; opening a PR against
dev is the orchestrator's step in this wave's process (per the campaign pattern: workers push,
the orchestrator opens/reviews/merges). So the windows-latest leg genuinely cannot be produced as
command-output evidence from within this worktree/session -- checking AC#4 without it would violate
the finalization guide's objective-evidence rule. Flagging clearly here (and in the final summary)
so the orchestrator/reviewer confirms the windows-latest leg is green on this branch's PR before
merge -- the change is platform-agnostic by construction (errno-code string matching only, no
process.platform branching, and the new tests spy on fs.renameSync directly rather than depending
on real OS lock behavior) so it is expected to pass there, but "expected" is not the same as
verified.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a small, bounded retry-with-backoff around the commit renameSync in both writeFileAtomic and
writeFileNoFollow (src/commands/fswrite.ts), a new unexported renameOverDestination helper
retrying up to 4 total attempts (20ms/40ms/80ms exponential backoff, synchronous Date.now() spin)
only on errno EPERM/EBUSY/EACCES -- any other code, or budget exhaustion, rethrows unchanged into
each function's existing catch/ioError classification, so a persistent failure still surfaces the
same denied LoreError it always did, never a swallowed false success. Neither function's temp-file
create/write, LORE-231 leak-guard cleanup, LORE-117 mode/ownership preservation, or LORE-130/92
symlink refusal was touched -- retry wraps only the single already-isolated commit-rename call.

Verified: bun test = 2116 pass / 0 fail across 48 files (test/fswrite.test.ts 32/32, +6 new
LORE-256 tests spying on fs.renameSync to inject deterministic transient/persistent EBUSY/EPERM/
EACCES/ENOENT failures -- covers both functions' recovery-after-transient-failure, exhausted-retry
classification, non-retryable-code fast-fail, and unaffected ordinary-success-path cases). bun run
typecheck: clean. bun run lint (biome): clean. bun run src/cli.ts check: "39 files, 0 errors, 0
warnings". Regression-test sanity check: reverted both renameOverDestination call sites back to
bare renameSync and reran the new describe block in isolation -- 4 of 6 new tests genuinely failed
(confirming they exercise real behavior), restored the fix, reconfirmed full bun test green.

AC#1-#3 checked off on that evidence. AC#4 left UNCHECKED on purpose: its full-suite/typecheck/
biome conjuncts are verified above, but the windows-latest CI leg cannot be produced as evidence
from this worktree -- ci.yml only runs the matrix on pull_request/push-to-main, and this worker's
procedure ends at pushing the feature branch (PR creation is the orchestrator's step in this wave).
See task notes for detail; the change is platform-agnostic by construction (errno-string matching
only, no process.platform branching) so the windows leg is expected green, but that still needs
confirming via the actual CI run on this branch's PR before merge.
<!-- SECTION:FINAL_SUMMARY:END -->
