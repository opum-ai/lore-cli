---
id: LORE-250
title: Suppress ANSI color on stderr diagnostics when stderr is not a TTY
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 22:07'
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
Round 1 (this session's predecessor) fixed only HALF of AC#1: errorRenderOpts(ctx, stderrIsTTY=true) gained the gate and cli.ts threaded the real stderrIsTTY to its two reportError call sites — but every command's WarningCollector.flush({ color: options.output.color, stderr }) call site (15 sites: check.ts:180/261, replace.ts:157, new.ts:503, orphans.ts:157, context.ts:80, validate.ts:78, rename.ts:153, supersede.ts:130, sync.ts:154, query.ts:78, tasks.ts:97/211, link.ts:637, graph.ts:85) reads options.output.color DIRECTLY and never round-trips through errorRenderOpts, so those sites still leaked stdout's raw color onto a redirected stderr. Fable's review (wave 28 request_changes) caught this via a real repro: `graph` warning "no frontmatter mapping" painted ANSI into a non-TTY stderr despite stdout being the only TTY.

Round 2 (this fix) closes the gap without touching any commands/*.ts file: resolveOutput (the single OutputContext construction site, in cli.ts's run()) now takes an optional stderrIsTTY input and folds it into the returned `color` at the source — `color` becomes the stdout decision further AND-gated by stderr's own TTY state. A new `stdoutColor` field carries the un-gated, stdout-only decision; emit()'s pretty branch now reads `ctx.stdoutColor ?? ctx.color` (falling back to `color` for hand-built test contexts that predate the field) so stdout's own rendering is provably unaffected (AC#2) even though `color` is now narrower. Because every flush call site already read `options.output.color`, and that field is now correctly gated at construction time, all 15 sites are fixed with zero changes to their files. cli.ts: stderrIsTTY is now computed before resolveOutput and passed into it; the two pre-existing errorRenderOpts(output, stderrIsTTY) calls for reportError are unchanged (now a harmless idempotent re-application). errors.ts remains untouched (git diff: 0 lines).

New non-vacuous regression (test/cli.test.ts): scaffolds a real bundle via run(["init"]), adds a frontmatter-free docs/stray.md, runs run(["graph"]) with isTTY:true/stderrIsTTY:false, and asserts the resulting "no frontmatter mapping" advisory on stderr contains no \x1b byte. Verified this fails against the pre-round-2 code (confirmed by temporarily swapping in the prior src/output.ts + src/cli.ts and re-running) and passes after. A companion test asserts the same warning IS colored when both stdout and stderr are TTYs. output.test.ts also gained direct resolveOutput coverage of the stderrIsTTY input (color vs. stdoutColor divergence) alongside the pre-existing errorRenderOpts-level tests (kept — they still validate that helper's own arithmetic, just no longer the only evidence for AC#1).

Verification: full `bun test` = 2050 pass / 0 fail (was 2043; net +7: 5 new output.test.ts cases, 2 new cli.test.ts end-to-end cases, plus 2 pre-existing output.test.ts toEqual assertions updated for the new stdoutColor field on OutputContext). `bun run typecheck` clean. Targeted `bun test test/output.test.ts test/cli.test.ts test/errors.test.ts` = 196 pass / 0 fail. `biome check` clean on all 4 changed files. `git diff --stat` confirms exactly src/output.ts, src/cli.ts, test/output.test.ts, test/cli.test.ts changed — src/errors.ts and every commands/*.ts file have zero diff.

AC evidence:
- AC#1: NOW covers both reportError AND WarningCollector.flush through REAL production call sites — output.test.ts's resolveOutput-level tests plus the new cli.test.ts end-to-end test that runs a real `graph` command's advisory warning through run() with isTTY:true/stderrIsTTY:false and asserts no ESC byte on stderr. (Previously this AC was checked on the strength of a unit test that composed flush({...errorRenderOpts(ctx, false), stderr}) directly — a wiring no command actually uses; that gap is what Fable's review caught and this round closes.)
- AC#2: pre-existing output.test.ts "pretty on a TTY with NO_COLOR unset enables color" (updated only for the new stdoutColor field, behavior unchanged) + cli.test.ts's stdout-byte-identity check + the new end-to-end test's implicit stdout-still-pretty rendering.
- AC#3: unchanged — cli.test.ts NO_COLOR test + output.test.ts unit coverage, now also exercised at the resolveOutput level.
- AC#4: unchanged — cli.test.ts AC#4 test (reportError) still green; the new flush-path test is the AC#1-specific analogue.
- AC#5: unchanged — cli.test.ts AC#5 test (reportError) still green; the new flush-path companion test is the AC#1-specific analogue.
- AC#6: full bun test suite green (2050/0); errors.ts and every commands/*.ts file unmodified (git diff confirms).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Suppressed ANSI color on stderr diagnostics whenever the stderr sink is not a TTY, independent of stdout's TTY state — for BOTH reportError and WarningCollector.flush, including every command's advisory-warning flush call site (graph/check/tasks/orphans/validate/query/context/link/rename/supersede/sync/replace/new: 15 sites total), not only the two top-level reportError call sites cli.ts's run() calls directly. A first pass fixed only the latter; a Fable review (wave 28) caught the remaining leak with a real repro (a `graph` command's "no frontmatter mapping" warning painting ANSI onto a redirected stderr) and this pass closes it.

The fix threads the real stderr TTY state into resolveOutput (cli.ts's single OutputContext-construction seam) rather than only into errorRenderOpts: OutputContext.color is now the stdout color decision further AND-gated by stderr's own TTY state, and a new OutputContext.stdoutColor field carries the un-gated, stdout-only decision that emit's pretty rendering path reads instead — so stdout's own color is provably unaffected (AC#2) even as every pre-existing `options.output.color` read at a command's flush call site becomes correctly stderr-safe with zero changes to those command files. errors.ts remains untouched.

Verified end-to-end via a new cli.test.ts regression: run(["graph"]) against a real bundle with a frontmatter-free file, isTTY:true + stderrIsTTY:false, asserts the resulting advisory warning on stderr contains no ESC byte — confirmed to fail against the pre-fix code and pass after. Full bun test 2050/0, typecheck clean, targeted output/cli/errors tests 196/0, biome clean, errors.ts and commands/*.ts diff-free.
<!-- SECTION:FINAL_SUMMARY:END -->
