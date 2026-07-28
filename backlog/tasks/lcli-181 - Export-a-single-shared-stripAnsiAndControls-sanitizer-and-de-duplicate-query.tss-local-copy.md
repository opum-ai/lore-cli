---
id: LCLI-181
title: >-
  Export a single shared stripAnsiAndControls sanitizer and de-duplicate
  query.ts's local copy
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - cmd-crud-b
  - codex-review-followup
dependencies: []
priority: low
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LCLI-118 sanitized lore query's renderText output using stripAnsiAndControls, but had to DUPLICATE the function locally in src/commands/query.ts because output.ts's copy is module-private and LCLI-118's scope forbade editing output.ts. As of wave 14 there are now THREE byte-identical copies: output.ts's renderTaskSummaryRows seam (stripAnsiAndControls), query.ts's local twin (whose comment still says "Keep the two in sync" — now stale, there are three), and — added by LCLI-161 — sanitizeForMessage in src/core/validate.ts. A future divergence between the copies would silently weaken one call site's terminal-escape sanitization, and the sync comments already mislead (validate.ts cites only output.ts). Fix: export a single shared sanitizer (the ANSI/control strip, plus singleLine composition as appropriate) from ONE module — natural home is src/errors.ts next to singleLine (layer-neutral, already imported by all three call sites' modules) — and route query.ts, output.ts, and validate.ts through it, removing the duplicates and correcting the stale comments. Flagged by the wave-6 LCLI-118 review; re-confirmed + widened by the wave-14 LCLI-161 integration review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 stripAnsiAndControls is defined in exactly one module and imported by both src/commands/query.ts and src/output.ts (no duplicate definition)
- [x] #2 lore query and lore tasks/orphans output remain sanitized identically — the LORE-118 and LORE-115 regression tests still pass unchanged
- [x] #3 Typecheck and the full bun test suite are green
- [x] #4 src/core/validate.ts sanitizeForMessage (added by LORE-161) also delegates to the shared sanitizer — no third copy of the ANSI/control regex remains in src/
- [x] #5 The stale "keep the two in sync" comments in query.ts / validate.ts are removed or corrected
- [x] #6 The core/links.ts sanitizeForMessage copy (added by LORE-153, wave 15) also delegates to the shared sanitizer — no ANSI/control-strip regex copy remains in src/core/links.ts either
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add exported stripAnsiAndControls(text) to src/errors.ts beside singleLine (raw two-pass ANSI/control strip primitive only, no singleLine composition baked in).
2. output.ts: import stripAnsiAndControls from ./errors, delete its module-private copy; renderTaskSummaryRows keeps its existing stripAnsiAndControls(singleLine(...)) composition unchanged.
3. commands/query.ts: import stripAnsiAndControls from ../errors, delete its local twin + stale 'Keep the two in sync' comment; sanitizeField keeps its existing stripAnsiAndControls(singleLine(text)) composition unchanged.
4. core/validate.ts: import stripAnsiAndControls from ../errors; sanitizeForMessage delegates to stripAnsiAndControls(singleLine(text)) instead of reimplementing the two regexes; correct the doc comment (was citing only output.ts).
5. core/links.ts: import stripAnsiAndControls from ../errors; sanitizeForMessage delegates the same way; correct its doc comment.
6. Verify: grep confirms the ANSI/control regex literal appears in exactly one file (src/errors.ts); bun run typecheck clean; full bun test suite green (LCLI-118 query.test.ts + LCLI-115 orphans.test.ts/output.test.ts unchanged pass); bun run lint shows no new findings on the 5 changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave-15 integration review (2026-07-23): LCLI-153 added a fourth byte-identical local copy of the ANSI/control-strip regex in src/core/links.ts (alongside src/output.ts, src/commands/query.ts, and the LCLI-161 copy in src/core/validate.ts). Widened this consolidation task with AC #6 to also fold links.ts into the single shared sanitizer, so the dedupe covers every current copy. All three core-layer copies already import singleLine from src/errors.ts, which is layer-neutral — hoisting the two-regex strip beside singleLine in errors.ts collapses all copies with no command-layer import.

Implemented: exported stripAnsiAndControls(text) from src/errors.ts beside singleLine (raw two-pass strip: ANSI/CSI/OSC escape sequences, then residual C0/C1/DEL control bytes). Routed all four call sites through it: output.ts's renderTaskSummaryRows, commands/query.ts's sanitizeField, core/validate.ts's sanitizeForMessage, core/links.ts's sanitizeForMessage — each keeping its exact prior composition (stripAnsiAndControls(singleLine(text)) at every site, byte-identical order/characters stripped). Deleted the four duplicate regex-bearing function bodies and the stale 'Keep the two in sync' / 'reimplemented locally rather than imported' comments, replacing them with cross-references to the LCLI-181 shared home. profile.ts untouched (sibling LCLI-193 owns it).

Verification:
- grep -rnE '\\x1[Bb]\(\?:' src/ -> exactly one hit: src/errors.ts:171 (no duplicate regex definition remains anywhere in src/, including core/links.ts and core/validate.ts).
- bun run typecheck -> clean (tsc --noEmit, no output/errors).
- bun test -> 1910 pass, 0 fail, 5375 expect() calls across 47 files (full suite, includes test/query.test.ts [LCLI-118] and test/orphans.test.ts + test/output.test.ts [LCLI-115], all passing unchanged).
- Targeted re-run: bun test test/query.test.ts test/orphans.test.ts test/output.test.ts test/validate.test.ts test/links.test.ts -> 306 pass, 0 fail.
- bun run lint (biome check .) -> no findings on any of the 5 changed files (src/errors.ts, src/output.ts, src/commands/query.ts, src/core/validate.ts, src/core/links.ts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hoisted the single ANSI/control-strip primitive stripAnsiAndControls(text) into src/errors.ts beside singleLine (layer-neutral, already imported by every call site's module) and routed all four former byte-identical copies through it: output.ts (renderTaskSummaryRows), commands/query.ts (sanitizeField), core/validate.ts (sanitizeForMessage, LCLI-161), and core/links.ts (sanitizeForMessage, LCLI-153). Each call site kept its exact prior composition — stripAnsiAndControls(singleLine(text)) — so observable output is byte-identical to before. Deleted all four duplicate regex-bearing function bodies and corrected the stale 'keep the two in sync' / local-twin comments to point at the shared LCLI-181 home. Verified: grep for the ANSI-strip regex literal now finds exactly one hit (src/errors.ts); bun run typecheck is clean; full bun test is 1910 pass / 0 fail (5375 expect() calls, 47 files), including the unchanged LCLI-118 (query.test.ts) and LCLI-115 (orphans.test.ts/output.test.ts) regression tests; bun run lint shows no findings on any of the 5 changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
