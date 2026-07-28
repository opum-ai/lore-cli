---
id: LCLI-70
title: process.exit() after run() can truncate large piped --json output
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
cli.ts calls process.exit(code) immediately after run() resolves. Bun stdout writes to a pipe are asynchronous, so exit() can tear down the process before a large write drains. Reproduced directly: writing 200000 bytes then exit(0) into a pipe truncates to exactly 65536 bytes with exit code 0. Any consumer piping large `--json` output from query/graph/context (CI capturing output, an agent parsing results) can silently receive truncated, invalid JSON with a success exit code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Large --json output (verified above the pipe-buffer size) is never truncated when lore exits, for query, graph, and context
- [x] #2 A test reproduces a multi-hundred-KB piped output and asserts the full byte count and valid JSON on the other end
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. cli.ts's import.meta.main block currently calls process.exit(code) immediately after run() resolves. Writes to process.stdout/stderr inside run() (via emit()/reportError()) are async for a piped destination; process.exit() tears the process down before they drain, truncating large output at the pipe's internal buffer size while still reporting exit 0.
2. Replace process.exit(code)/process.exit(EXIT_UNCAUGHT) with process.exitCode = code (no forced exit) so the runtime drains pending stdout/stderr writes naturally before terminating. Verified empirically that the CLI's actual async paths (fetch in check --external, Bun.spawn+awaited .exited in the backlog adapter) do not leave dangling handles, so removing the forced exit does not risk a hang.
3. Add a regression test spawning the real cli.ts entrypoint as a subprocess, piped through a downstream process (sh -c "... | cat") to reproduce the actual race (Bun.spawnSync's own direct stdout:"pipe" capture reads too eagerly to reproduce it) — covering query, graph, and context with output sized past the pipe buffer.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: cli.ts's import.meta.main block called process.exit(code) immediately after run() resolved. emit()/reportError() write to process.stdout/stderr, which is async for a piped destination — process.exit() tore the process down before the write's underlying syscall completed, silently truncating output at the pipe's internal buffer size while still reporting exit 0.

Fix: replaced both process.exit(code) and process.exit(EXIT_UNCAUGHT) with process.exitCode = <code> (no forced exit), letting the runtime drain pending I/O naturally before terminating. Verified this does not risk a hang: check --external's fetch() and the backlog adapter's Bun.spawn both already complete/await fully before run() resolves (proc.exited is awaited in adapters/backlog.ts), and an isolated fetch()-then-exit repro confirmed Bun's fetch leaves no dangling handle.

Verification: bun -e 'process.stdout.write("x".repeat(200000)); process.exit(0)' | wc -c confirmed the pre-fix truncation point is exactly 65536 bytes. Built a synthetic docs/ bundle (1 concept with a 300000-char body, 80 concepts with 4000-char title/summary fields) and ran graph/query/context --json for real through sh -c "bun cli.ts ... | cat" (a downstream-process pipe, not Bun.spawnSync's own direct stdout:"pipe" capture, which reads too eagerly to reproduce the race). Confirmed via git stash: pre-fix code truncated all three commands to exactly 65536 bytes with invalid JSON, exit 0; post-fix code produced full valid JSON (326323 / 646421 / 300240 bytes respectively). Added test/cli-exit-flush.test.ts covering all three commands with this exact harness — 3/3 pass post-fix, 3/3 fail pre-fix (confirmed by temporarily reverting cli.ts). Full suite: bun test -> 1505 pass/0 fail (was 1500 before this task). bun run typecheck clean. bun run lint: 4 pre-existing infos in unrelated files, none in src/cli.ts or the new test file.

Independent adversarial review (general-purpose subagent) found the fix correct with no hang risk (traced every async path reachable from run(): check --external's AbortSignal.timeout-based fetch, the backlog adapter's fully-awaited Bun.spawn, no timers/servers/stdin reads anywhere in src/) and no other truncation-risk process.exit() sites in src/ (bin/lore.cjs's 4 process.exit() calls are architecturally similar but out of scope/low-risk: its main exit follows a synchronous spawnSync with stdio:inherit, so the child writes directly to the real fd). One moderate finding: the new test/cli-exit-flush.test.ts lacked a Windows platform guard despite spawning sh/cat and depending on POSIX pipe-buffer semantics that don't apply to Windows named pipes, while CI's matrix includes windows-latest and this repo already has precedent (bin-lore.test.ts) for skipIf(win32) on POSIX-flavored subprocess tests. Fixed: added describe.skipIf(process.platform === "win32") matching that precedent. Re-verified post-fix: bun test test/cli-exit-flush.test.ts -> 3/3 pass, full bun test -> 1505/1505, typecheck clean, lint clean on the changed file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced cli.ts's process.exit(code)/process.exit(EXIT_UNCAUGHT) (called immediately after run() resolves) with process.exitCode = <code>, so the runtime drains pending async stdout/stderr writes before terminating instead of tearing the process down mid-write. Verified with a real-subprocess regression test (test/cli-exit-flush.test.ts) piping query/graph/context --json output (300KB-650KB) through a downstream process the way the original bug required to reproduce; confirmed via git stash that the test fails against pre-fix code (truncates to exactly 65536 bytes, invalid JSON, exit 0) and passes post-fix (full valid JSON). Full suite 1505/1505 pass, typecheck clean, no new lint findings.
<!-- SECTION:FINAL_SUMMARY:END -->
