---
id: LORE-250
title: Suppress ANSI color on stderr diagnostics when stderr is not a TTY
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 Color for stderr diagnostics (reportError and WarningCollector.flush) is suppressed whenever the stderr sink is not a TTY, independent of stdout's TTY state.
- [ ] #2 stdout pretty-mode color is unchanged: stdout at a TTY with NO_COLOR unset still emits color to stdout.
- [ ] #3 NO_COLOR (set to any value, including empty) still suppresses color on both streams.
- [ ] #4 Test: with an injected TTY stdout but a non-TTY stderr and NO_COLOR unset, a reported LoreError writes no ESC (\x1b) byte to stderr.
- [ ] #5 Test: with both stdout and stderr at a TTY and NO_COLOR unset, the stderr error head is still colored.
- [ ] #6 Existing cli.ts, errors.ts, and output.ts tests continue to pass. (Note: consulting stderr's TTY state will require plumbing it — e.g. an added RunContext field defaulting to process.stderr.isTTY; the exact seam is left to the implementer.)
<!-- AC:END -->
