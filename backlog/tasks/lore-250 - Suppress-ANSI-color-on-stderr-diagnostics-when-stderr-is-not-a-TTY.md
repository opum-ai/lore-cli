---
id: LORE-250
title: Suppress ANSI color on stderr diagnostics when stderr is not a TTY
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 21:45'
labels:
  - errors-output-git
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 352000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** When stdout is a TTY (pretty mode) but stderr is redirected to a file or pipe, lore must not paint ANSI color into that stderr stream — its error and warning diagnostics should be ANSI-free.

**Why:** `resolveOutput` (src/output.ts:127-132) derives a single `color` boolean from `mode`, and `mode` comes only from stdout's TTY state (`resolveMode`, src/output.ts:79-87; `isTTY` sourced from `process.stdout.isTTY` at src/cli.ts:168). `errorRenderOpts` (src/output.ts:142-144) reuses that same `color` for the stderr diagnostic path — `reportError` (src/errors.ts:560) and `WarningCollector.flush` (src/errors.ts:647). So `lore <cmd> 2>err.log` run from a terminal (stdout is a TTY, stderr is not) writes ANSI escapes into err.log. cli-contract §6 (docs/reference/cli-contract.md:354-356) states color is emitted 'only on a TTY'; the redirected stderr is not a TTY, so this is a §6-inconsistent color leak. `RunContext` currently carries only one `isTTY` field (src/cli.ts:134), read from stdout, so stderr's own TTY state is never consulted. Color is cosmetic and never load-bearing (§6), which is why this is low severity.

**Provenance:** doc-2 Codex second-opinion review, low-severity finding (cited output.ts:130), errors-output-git cluster. Re-verified still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Color for stderr diagnostics (reportError and WarningCollector.flush) is suppressed whenever the stderr sink is not a TTY, independent of stdout's TTY state.
- [x] #2 stdout pretty-mode color is unchanged: stdout at a TTY with NO_COLOR unset still emits color to stdout.
- [x] #3 NO_COLOR (set to any value, including empty) still suppresses color on both streams.
- [x] #4 Test: with an injected TTY stdout but a non-TTY stderr and NO_COLOR unset, a reported LoreError writes no ESC (\x1b) byte to stderr.
- [x] #5 Test: with both stdout and stderr at a TTY and NO_COLOR unset, the stderr error head is still colored.
- [x] #6 Existing cli.ts, errors.ts, and output.ts tests continue to pass. (Note: consulting stderr's TTY state will require plumbing it — e.g. an added RunContext field defaulting to process.stderr.isTTY; the exact seam is left to the implementer.)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. output.ts: give errorRenderOpts(ctx, stderrIsTTY=true) a second param; returned color = ctx.color && stderrIsTTY (ctx.color itself, which drives stdout's own pretty rendering, stays untouched). Default true preserves every pre-existing call site's behavior when omitted.
2. cli.ts: add RunContext.stderrIsTTY?: boolean (mirrors isTTY's real-process/injected-sink default shape but reads process.stderr.isTTY / context.stderr). Compute it once in run() and pass it to both errorRenderOpts(output, stderrIsTTY) call sites (the sync catch and the async .catch).
3. Do not touch errors.ts — reportError/WarningCollector.flush already accept color as a parameter.
4. Tests: output.test.ts unit-level coverage of errorRenderOpts's new stderrIsTTY gate (default no-op, suppress, keep, non-pretty unaffected) plus reportError/flush wired through it; cli.test.ts end-to-end coverage of AC#4/AC#5/AC#3 via run() with isTTY/stderrIsTTY/env combinations, plus an independence check that stdout bytes are unaffected by stderrIsTTY.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix landed entirely in output.ts (errorRenderOpts gained an optional stderrIsTTY=true param; returned color = ctx.color && stderrIsTTY) and cli.ts (new RunContext.stderrIsTTY field, computed once in run() mirroring the isTTY real-process/injected-sink default shape, threaded to both errorRenderOpts call sites). errors.ts untouched (git diff confirms 0 lines changed) — reportError/WarningCollector.flush already accepted color as a parameter, so no change was needed there.

Verification: full `bun test` = 2043 pass / 0 fail (was 2043 total incl. new tests); `bun run typecheck` clean; `bun test test/output.test.ts test/cli.test.ts test/errors.test.ts` = 189 pass / 0 fail. bunx biome check on all 4 changed files: no issues.

AC evidence:
- AC#1: output.test.ts new describe block 'stderr's own TTY state gates the derived color independently of stdout's' — direct reportError + WarningCollector.flush tests with stderrIsTTY false/true.
- AC#2: pre-existing output.test.ts 'pretty on a TTY with NO_COLOR unset enables color' (untouched, still passing) + new cli.test.ts independence check that stdout bytes are byte-identical regardless of stderrIsTTY.
- AC#3: new cli.test.ts test — NO_COLOR:'' with both streams TTY still suppresses stderr color; also covered at unit level (non-pretty context stays color-free regardless of stderrIsTTY in output.test.ts).
- AC#4: new cli.test.ts test 'AC#4: stdout TTY + non-TTY stderr + NO_COLOR unset -> a reported LoreError writes no ESC byte to stderr' — asserts stderr text does NOT contain \x1b.
- AC#5: new cli.test.ts test 'AC#5: both stdout and stderr TTYs + NO_COLOR unset -> the stderr error head is still colored' — asserts stderr text contains \x1b[31m.
- AC#6: full bun test suite green (2043/0), confirming cli.ts/errors.ts/output.ts existing tests all still pass unmodified in behavior (only additive test edits).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Suppressed ANSI color on stderr diagnostics whenever the stderr sink is not a TTY, independent of stdout's TTY state. errorRenderOpts (output.ts) now takes an optional stderrIsTTY param (default true, a no-op gate preserving prior behavior for every existing call site) and returns color = ctx.color && stderrIsTTY, so reportError/WarningCollector.flush suppress color on a redirected stderr even when stdout is a colored TTY. cli.ts's run() gained a RunContext.stderrIsTTY field (mirrors the existing isTTY default shape, reading process.stderr.isTTY on the real-process path) and threads it into both errorRenderOpts call sites. errors.ts and stdout's own color decision (ctx.color, used by emit's pretty branch) are untouched. Verified: full bun test 2043/0, bun run typecheck clean, targeted bun test test/output.test.ts test/cli.test.ts test/errors.test.ts 189/0, biome check clean on all 4 changed files, git diff confirms errors.ts has zero changes.
<!-- SECTION:FINAL_SUMMARY:END -->
