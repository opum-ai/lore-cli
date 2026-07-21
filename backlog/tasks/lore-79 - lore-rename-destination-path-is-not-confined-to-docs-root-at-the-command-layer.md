---
id: LORE-79
title: >-
  lore rename destination path is not confined to docs/ root at the command
  layer
status: In Progress
assignee:
  - '@jeremy'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 17:04'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The destination id (newId) in commands/rename.ts is never confined to the bundle root before assertTargetFree/commitWrites resolve and write to it. Reproduced directly: `lore rename reference/orders ../../../../tmp/pwned` relocates the renamed concept content outside docs/. commands/new.ts already guards this class of escape for --out via resolveOutPath; rename.ts has no equivalent. Related to the args.ts and rewrite.ts findings from the same review, which cover the other two layers of this same gap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 commands/rename.ts confines the resolved destination path to the bundle root before any write, mirroring resolveOutPath in commands/new.ts
- [x] #2 A traversal or absolute destination id is rejected with a clear error before any file is moved or written
- [x] #3 A test reproduces the traversal repro above and asserts it now fails
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Live-CLI verify (done): `lore rename reference/orders ../../../../tmp/pwned` against a scratch
   bundle already exits 6 (validation) via LORE-80's rewriteInbound-layer assertConfinedToBundle —
   the underlying escape is closed. This task adds the AC's own command-layer confinement in
   commands/rename.ts anyway: defense-in-depth (doesn't rely on the engine's internal guard) and a
   clearer usage-level error (exit 2) before any bundle load/write, mirroring new.ts's
   resolveOutPath in spirit though not algorithm (rename operates on bundle-relative concept ids,
   not real filesystem paths, so resolve+relative doesn't fit — mirror LORE-80's own
   escapesRoot/assertConfinedToBundle segment-walk instead, reused not re-derived).
2. Export `escapesRoot` from core/rewrite.ts (currently module-private) — reuse the same
   already-review-tested separator-agnostic segment walk rather than duplicating security-sensitive
   traversal-detection logic a second time.
3. Add `assertDestinationConfined(newId)` in commands/rename.ts: checks posix.isAbsolute /
   win32.isAbsolute / escapesRoot on the RAW parsed.newId (before idFromPath runs, mirroring
   rewrite.ts's own documented reasoning for checking pre-normalize), throws a `usage` LoreError
   (exit 2) with `{ id: newId }` echoed as input (cli-contract §5.2 convention, matches
   assertNotReservedStem's shape). Call it immediately after parseRenameArgs, before idFromPath /
   docsRoot / loadBundle — fails fast with zero IO, same positioning as assertNotReservedStem.
4. Update rename.ts's top-of-file docstring's exit-code summary to mention the new usage case.
5. Tests in test/rename.test.ts's "lore rename — errors and arg parsing" block: traversal newId,
   absolute newId, backslash-spelled traversal, mixed-separator traversal, and a non-regression
   case (a real "..foo/bar"-style segment is NOT rejected) — mirrors LORE-80's own test set per the
   campaign's recorded convention (backslash + mixed-separator cases, not just forward-slash).
6. Verify: full bun test, typecheck, lint; live-CLI re-verify the exact task repro now exits 2
   (usage) at the command layer instead of falling through to rewriteInbound's 6 (validation);
   confirm nothing is written in either case (already true).
7. Independent adversarial review (general-purpose subagent) after committing fix+tests, per this
   campaign's standing discipline.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Live pre-fix repro confirmed the underlying escape is ALREADY closed by LORE-80's engine-layer
assertConfinedToBundle: `lore rename reference/orders ../../../../tmp/pwned` against a scratch
bundle exits 6 (validation), nothing written outside docs/. This task adds the AC's own
command-layer confinement in commands/rename.ts anyway (defense-in-depth + a clearer usage-level
error at exit 2, matching new.ts's resolveOutPath pattern in spirit).

Implementation: exported `escapesRoot` from core/rewrite.ts (was module-private) rather than
duplicating the security-sensitive segment-walk logic a second time. Added
`assertDestinationConfined(newId)` in commands/rename.ts, checking posix.isAbsolute/
win32.isAbsolute/escapesRoot on the RAW parsed.newId (before idFromPath runs, mirroring
rewrite.ts's own pre-normalize reasoning), called immediately after parseRenameArgs — before
idFromPath/docsRoot/loadBundle, zero IO on the reject path. Throws `usage` (exit 2) with
`{ id: newId }` echoed as input, matching assertNotReservedStem's existing convention.

5 new tests in test/rename.test.ts's "errors and arg parsing" block (exact task repro, absolute,
backslash-spelled, mixed-separator, and a non-regression "..foo/bar" false-positive check) —
mirrors LORE-80's own test set per the campaign's recorded convention. Confirmed via `git stash`
that the 4 fix-differentiating tests genuinely fail pre-fix (received "validation" instead of
"usage" — proving they exercise the new command-layer guard, not the pre-existing engine one).

Live-CLI re-verified post-fix: the exact task repro now exits 2 (usage) instead of falling through
to rewriteInbound's validation/exit 6; backslash and absolute variants also exit 2; a legitimate
rename (reference/orders -> reference/sales-orders) still exits 0 and writes correctly. Confirmed
no leakage outside docs/ or the real repo (git status --porcelain clean throughout).

Verified: bun test full suite 1655/1655 pass (up from 1650); bun run typecheck clean; bun run lint
— 4 pre-existing infos in unrelated test files (managed-block.test.ts, supersede.test.ts), none in
changed files.
<!-- SECTION:NOTES:END -->
