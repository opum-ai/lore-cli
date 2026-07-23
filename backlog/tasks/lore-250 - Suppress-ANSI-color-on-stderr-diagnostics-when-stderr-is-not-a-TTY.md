---
id: LORE-250
title: Suppress ANSI color on stderr diagnostics when stderr is not a TTY
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 22:23'
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

Round 3 (this fix, responding to Fable's wave-28 request_changes on round 2): the round-2 fix gated color correctly ONLY when every caller passed an already-boolean stderrIsTTY. The real, uninjected process path did not: cli.ts's run() computed `context.stderrIsTTY ?? (context.stderr ? false : process.stderr.isTTY)` — and Node/Bun leave `process.stderr.isTTY` as `undefined` (not `false`) on a non-TTY stream (a redirected `2>` or a pipe), which @types/node's `boolean` typing on the property does not surface. That `undefined` then flowed into resolveOutput's `stderrIsTTY ?? true` default (output.ts) AND errorRenderOpts's `stderrIsTTY = true` default parameter (a default parameter fires on an explicitly-passed `undefined`, not only on an omitted argument) — both back-compat no-op defaults designed for a caller that never passes the field at all, not for a caller passing an uncoerced real read. So in the actual shipped binary (`run(process.argv)`, empty context, cli.ts:429+), BOTH WarningCollector.flush and reportError still painted ANSI onto a redirected stderr. Confirmed live at pre-fix HEAD under a real pty: `script -q /dev/null zsh -c 'bun run src/cli.ts frobnicate 2>err.log'` wrote `\x1b[31merror:\x1b[0m unknown command...` into err.log, and a `graph` run against a frontmatter-free doc wrote a colored `\x1b[33mwarning:...` advisory. All 2050 round-2 tests stayed green because every one of them injects a stderr sink or passes stderrIsTTY explicitly — none reaches the real-process fallback.

Fix: added an exported coerceRealTTY(isTTY: boolean | undefined): boolean helper in cli.ts (`isTTY === true`) and used it at the real-process fallback: `context.stderrIsTTY ?? (context.stderr ? false : coerceRealTTY(process.stderr.isTTY))`. This guarantees the value handed to resolveOutput/errorRenderOpts from the real process is always a genuine boolean, never undefined, so their `?? true` back-compat defaults are only ever reached by a caller that omitted the field outright (the case they exist for). Strengthened the docstrings at output.ts's module header, OutputContext.color, ResolveInputs.stderrIsTTY, resolveOutput, and errorRenderOpts, plus cli.ts's RunContext.stderrIsTTY doc, to flag the "?? true is a no-op for omission, not a safety fallback" danger explicitly and point at coerceRealTTY, so a future caller sourcing a real stream's .isTTY doesn't reopen this.

Verification (round 3): confirmed the fix with the exact real-pty repro Fable used — `script -q /dev/null zsh -c 'bun run src/cli.ts frobnicate 2>err.log'` now writes a plain, ANSI-free `error: unknown command "frobnicate"` / `hint: ...` to err.log (reproduced the pre-fix leak first by temporarily reverting just the coercion, confirming it painted `\x1b[31m` into the same file, then restored the fix and reconfirmed clean). Same clean result for a real `graph` run against a frontmatter-free doc (`warning: skipping stray.md: no frontmatter mapping...`, no ESC byte).

New non-vacuous test coverage (test/cli.test.ts, new describe "cli — real-process stderrIsTTY fallback coerces an absent .isTTY to false (LORE-250, round 3)"): (1) a direct unit test of coerceRealTTY's coercion table (undefined/false -> false, true -> true); (2) a production-leak-repro test that stubs `process.stdout.isTTY = true` / `process.stderr.isTTY = undefined` via Object.defineProperty(configurable:true, restored in finally) and monkeypatches process.stderr.write to capture bytes, then calls run(argv("frobnicate"), { env: {} }) with NO injected stdout/stderr sink — i.e. the exact real-process seam — and asserts the captured stderr text contains no \x1b byte; (3) a companion test with both real .isTTY stubbed true, asserting the stderr error head IS colored (proving this isn't a blanket suppression). Verified test (2) fails against the pre-round-3 code (temporarily reverted just the coercion, confirmed the test's `not.toContain("\x1b")` assertion fails with the exact leaked bytes, then restored the fix) and passes after — this is the first test in the suite that reaches the real-process fallback at all; every pre-existing test in this file injects a stderr sink via ctx().

Verification: full `bun test` = 2053 pass / 0 fail (was 2050; net +3: the coerceRealTTY unit test + the two real-process repro tests). `bun run typecheck` clean. Targeted `bun test test/output.test.ts test/cli.test.ts test/errors.test.ts` = 199 pass / 0 fail. `biome check` clean on all changed files. `git diff --stat` confirms only src/cli.ts, src/output.ts, test/cli.test.ts, and this task file changed — src/errors.ts and every commands/*.ts file remain diff-free.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Suppressed ANSI color on stderr diagnostics whenever the stderr sink is not a TTY, independent of stdout's TTY state — for BOTH reportError and WarningCollector.flush, across every command's flush call site AND cli.ts's own real-process dispatch path (`run(process.argv)` with no injected context), which is the one seam the round-2 fix left leaking.

Round 1 fixed only the two top-level reportError call sites. Round 2 (Fable wave-28 review) closed the remaining 15 WarningCollector.flush call sites by gating color at resolveOutput, the single OutputContext-construction seam — but its real-process stderrIsTTY fallback (`context.stderrIsTTY ?? (context.stderr ? false : process.stderr.isTTY)`) read `process.stderr.isTTY` uncoerced. Node/Bun leave that property `undefined` (not `false`) on a non-TTY stream, and that `undefined` silently fell through resolveOutput's and errorRenderOpts's `?? true` back-compat defaults (meant for a caller that omits the field entirely, not one passing an uncoerced real read) — so the actual shipped binary still painted ANSI onto a redirected stderr. Fable's review caught this with a real pty repro.

Round 3 (this pass) fixes it at the source: `coerceRealTTY(isTTY: boolean | undefined): boolean` (`isTTY === true`, exported from cli.ts) coerces the real-process read before it ever reaches a `??` default, so the value handed downstream is always a genuine boolean. Strengthened output.ts's and cli.ts's docstrings to flag the "?? true is a no-op for omission, not a safety net" danger explicitly, so a future caller sourcing a real stream's `.isTTY` doesn't reopen this.

Verified with the exact real-pty repro Fable used (`script -q /dev/null zsh -c 'bun run src/cli.ts <cmd> 2>err.log'`): confirmed the leak reproduces against pre-round-3 code (temporarily reverted just the coercion) and is gone after the fix, for both an unknown-command error and a real `graph` advisory warning. New test/cli.test.ts coverage adds a unit test for coerceRealTTY's coercion table plus two tests that stub the real `process.stdout.isTTY`/`process.stderr.isTTY` (Object.defineProperty, restored in finally) and monkeypatch `process.stderr.write` to capture bytes from an uninjected `run()` call — the first tests in the suite to reach the real-process fallback at all; every prior test injects a stderr sink. Confirmed the leak-repro test fails against pre-round-3 code and passes after.

Full `bun test`: 2053 pass / 0 fail (was 2050, +3 net new). `bun run typecheck` clean. Targeted `bun test test/output.test.ts test/cli.test.ts test/errors.test.ts`: 199 pass / 0 fail. `biome check` clean on all changed files. `git diff --stat`: only src/cli.ts, src/output.ts, test/cli.test.ts, and this task file changed — src/errors.ts and every commands/*.ts file remain diff-free.
<!-- SECTION:FINAL_SUMMARY:END -->
