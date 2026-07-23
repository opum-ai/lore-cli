---
id: LORE-217
title: Bound the real backlog subprocess spawn (bunBacklogSpawn) with a timeout
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 `bunBacklogSpawn` enforces a maximum wall-clock duration on the spawned process: a subprocess that does not exit within the bound is killed and the call surfaces a typed LoreError (or rejects) instead of awaiting `proc.exited` forever.
- [ ] #2 The timeout default is generous and operator-overridable (e.g. via an environment variable) so a legitimately slow `backlog` invocation is not truncated in normal use.
- [ ] #3 A test spawns a deliberately non-terminating process through `bunBacklogSpawn` (following the real-binary pattern in test/backlog-probe.test.ts:198-225) and asserts the call terminates via the timeout within the bound rather than hanging.
- [ ] #4 `bun test` passes, including the existing test/backlog-adapter.test.ts and test/backlog-probe.test.ts suites.
<!-- AC:END -->
