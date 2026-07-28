---
id: LCLI-217
title: Bound the real backlog subprocess spawn (bunBacklogSpawn) with a timeout
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - adapter-backlog
  - codex-review-followup
dependencies: []
priority: low
type: enhancement
ordinal: 319000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `bunBacklogSpawn` should not be able to hang lore forever waiting on a `backlog` subprocess that never exits.

**Why:** `bunBacklogSpawn` is the real (non-test) BacklogSpawn — the only place lore shells the `backlog` binary. It runs `Bun.spawn` and then awaits `proc.exited` (plus fully buffering both streams) with no upper time bound, so a wedged or non-terminating `backlog` invocation leaves lore blocked with no diagnostic. Every lore coupling command (link/unlink/rename/sync/reconcile) ultimately flows through this seam, so the hang is process-wide.

**Live context:** src/adapters/backlog.ts:235-244 — `Bun.spawn([binary, ...args], { stdout: 'pipe', stderr: 'pipe', cwd })` at :237, then `const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);`. No `timeout`, no `signal`/AbortSignal, no `proc.kill()`. (Note: the injectable BacklogSpawn seam and the test fakes are unaffected — only the real implementation needs the guard. The 'unbounded buffer' half of the finding is largely non-actionable because JSON reads need the whole envelope to parse; the actionable robustness fix is the timeout, which also caps a runaway process.)

**Provenance:** doc-2 (Codex second-opinion review) low-severity finding, adapter-backlog cluster, round-3 re-audit — confirmed still present on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `bunBacklogSpawn` enforces a maximum wall-clock duration on the spawned process: a subprocess that does not exit within the bound is killed and the call surfaces a typed LoreError (or rejects) instead of awaiting `proc.exited` forever.
- [x] #2 The timeout default is generous and operator-overridable (e.g. via an environment variable) so a legitimately slow `backlog` invocation is not truncated in normal use.
- [x] #3 A test spawns a deliberately non-terminating process through `bunBacklogSpawn` (following the real-binary pattern in test/backlog-probe.test.ts:198-225) and asserts the call terminates via the timeout within the bound rather than hanging.
- [x] #4 `bun test` passes, including the existing test/backlog-adapter.test.ts and test/backlog-probe.test.ts suites.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm Bun.spawn has no native timeout wired in bunBacklogSpawn (src/adapters/backlog.ts:235-244). 2. Add BACKLOG_TIMEOUT_ENV_VAR (LORE_BACKLOG_TIMEOUT_MS) + DEFAULT_BACKLOG_TIMEOUT_MS (30000ms) + resolveBacklogTimeoutMs() read fresh per call. 3. In bunBacklogSpawn, arm a setTimeout that sets a timedOut flag and proc.kill('SIGKILL') (SIGKILL not SIGTERM, since a wedged process may be ignoring SIGTERM); after the existing Promise.all/proc.exited settles, throw a typed LoreError('validation', ...) naming the override env var when timedOut, else return the SpawnResult as before; clearTimeout in a finally. Do not touch the BacklogSpawn interface signature or any test fake. 4. Add a test in test/backlog-probe.test.ts (same describe block as the existing real-binary tests) that spawns process.execPath with an inline 'while (true) {}' script, sets LORE_BACKLOG_TIMEOUT_MS=200 for the call, and asserts the call rejects with a LoreError within a generous bound (<4s) instead of hanging, restoring the env var in a finally. 5. Verify: bun test (full suite) + bun run typecheck + bunx biome check on changed files; confirm no leaked child process.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: added BACKLOG_TIMEOUT_ENV_VAR (LORE_BACKLOG_TIMEOUT_MS, default 30000ms) and resolveBacklogTimeoutMs() to src/adapters/backlog.ts; bunBacklogSpawn now arms a setTimeout that proc.kill('SIGKILL')s the real subprocess and throws a typed LoreError('validation', exit 6) naming the override env var when the process does not exit within the bound, instead of awaiting proc.exited unbounded. The BacklogSpawn interface/type, createBacklogAdapter, probeBacklog, and every test fake are untouched -- only the real Bun.spawn implementation body changed (plus doc comments). Added a new test in test/backlog-probe.test.ts (same 'bunBacklogSpawn -- the real Bun.spawn seam' describe block as the existing real-binary tests) that spawns process.execPath with an inline 'while (true) {}' busy loop, sets LORE_BACKLOG_TIMEOUT_MS=200 for the call, and asserts: the call rejects with LoreError(type=validation, exit 6) within <4s (not a hang), the message names the 200ms bound, and the hint names LORE_BACKLOG_TIMEOUT_MS; the env var is restored in a finally. Verified no leaked child process after the test (ps aux grep for the busy-loop script found nothing post-run).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bounded the real backlog subprocess spawn (bunBacklogSpawn, src/adapters/backlog.ts) with an operator-overridable wall-clock timeout so a wedged 'backlog' invocation can no longer hang lore forever. Added BACKLOG_TIMEOUT_ENV_VAR=LORE_BACKLOG_TIMEOUT_MS (default DEFAULT_BACKLOG_TIMEOUT_MS=30000ms, re-read per call, falling back to the default on unset/blank/non-numeric/non-positive values). bunBacklogSpawn arms a setTimeout for the bound; on fire it proc.kill('SIGKILL')s the subprocess and, once the existing Promise.all/proc.exited settles, throws a typed LoreError('validation', exit 6) naming the override knob instead of resolving -- a normal exit within the bound clears the timer and returns the SpawnResult exactly as before. The injectable BacklogSpawn seam, createBacklogAdapter, probeBacklog, and every existing test fake are unchanged; only the real implementation body (plus doc comments describing it) changed. Did not attempt to bound buffer size, per the task's own scope note. Verified: full 'bun test' 1924 pass / 0 fail (including test/backlog-adapter.test.ts and test/backlog-probe.test.ts), 'bun run typecheck' clean, 'bunx biome check' clean on both changed files. New test (test/backlog-probe.test.ts, 'bunBacklogSpawn -- the real Bun.spawn seam' block, following the real-binary pattern) spawns process.execPath running an inline non-terminating 'while (true) {}' script through bunBacklogSpawn with LORE_BACKLOG_TIMEOUT_MS=200, and asserts the call terminates (rejects with LoreError type=validation, exit 6, message naming the 200ms bound, hint naming the env var) within 4s rather than hanging; confirmed no leaked child process afterward.
<!-- SECTION:FINAL_SUMMARY:END -->
