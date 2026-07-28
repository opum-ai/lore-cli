---
id: LCLI-258
title: >-
  lore: harmonize non-concept-file handling — spurious 'no frontmatter mapping'
  warning on link/sync/unlink/tasks but not check; inconsistent skipped-count
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:31'
labels:
  - cli-ux
  - core-bundle
  - output
dependencies: []
references:
  - src/core/bundle.ts
priority: low
type: bug
ordinal: 360000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Consistent, non-noisy handling of known non-concept files (e.g. log.md, stories/index.md) across every command that loads the bundle.

## Observed (real run)
- The warning 'skipping <file>: no frontmatter mapping, treated as a non-concept file' (emitted at src/core/bundle.ts:182 when a warnings collector is passed) fires on 'lore link', 'lore sync', 'lore unlink', and 'lore tasks' for log.md and stories/index.md — but 'lore check' scans the same bundle and stays silent about them.
- 'lore validate' reports a '0 skipped' count in its summary; 'lore check' has no equivalent field despite silently passing over the same non-concept files.

## Why it matters
These files (the regenerated log.md, child-dir index.md) are KNOWN reserved/non-concept files, so warning about them on every coupling command is spurious noise that trains users to ignore warnings. The asymmetry (check silent, coupling loud, validate counts) is confusing and makes the warning look like a problem when it is not.

## Direction (not prescriptive)
Either suppress the reserved/non-concept warning on the coupling commands the way check already does (don't pass a warnings collector for known-reserved stems, or filter them), OR surface a consistent 'skipped: N' summary across check/validate/coupling so the behavior reads the same everywhere. Pick one and apply it uniformly.

## Refs
src/core/bundle.ts:182 (the warning); compare check.ts vs validate.ts vs link.ts/sync.ts/tasks.ts loadBundle call sites (whether each passes a warnings collector).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The 'no frontmatter mapping' warning for known reserved/non-concept files (log.md, child index.md) is handled identically across check, validate, link, unlink, sync, and tasks — either uniformly suppressed for reserved stems, or uniformly surfaced as a skipped count.
- [x] #2 No command emits the warning for a file that another command (check) silently treats as a non-concept — the asymmetry is gone, verified by running each command on the same bundle.
- [x] #3 If a skipped-count is chosen, check gains the same summary field validate has; if suppression is chosen, validate's behavior is reconciled too. Existing tests updated; full suite + lore check on the repo's own bundle stay green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root cause: only src/commands/{link,unlink(shares link.ts),sync,tasks}.ts call loadBundle(docsRoot, { warnings: advisories }); check.ts and validate.ts never call loadBundle at all -- check does its own file scan (deliberately, LCLI-27), validate calls tryParseConcept directly per-file and already tallies a clean skippedCount with zero per-file warnings. So the single warning source is src/core/bundle.ts:182's `options.warnings?.add('skipping ... no frontmatter mapping ...')` inside loadBundle.
2. Decision: suppress, scoped to RESERVED_STEMS (index/log) only -- not a skipped-count on check, and not blanket-suppress every non-concept skip. Rationale: the task's own "Observed"/"Why it matters" text calls out log.md and child index.md specifically as KNOWN reserved/non-concept files (indexes.ts/log.ts always regenerate them frontmatter-free) -- the noise is spurious BECAUSE they are known-reserved, not because skip-warnings in general are unwanted. A genuinely unexpected non-concept file (e.g. a stray hand-written .md with no frontmatter) is still worth a warning and must keep warning (pinned by an existing test, cli.test.ts:368, and the new stray-file regression tests added per command). Suppressing in bundle.ts (loadBundle's own null-branch) is the single shared choke point, so every loadBundle-backed caller (link/unlink/sync/tasks, plus graph/query/context/orphans/supersede/rename as a side benefit) is fixed uniformly with no per-command logic to keep in sync.
3. AC#3 "if suppression is chosen, validate's behavior is reconciled too": validate never emits the per-file warning at all (reserved or not) -- it only reports a skippedCount. That is already consistent with "no noise for reserved files"; no functional change needed there, but add a regression test locking it in as the reconciliation target.
4. Implementation: import RESERVED_STEMS from core/scaffold.ts into core/bundle.ts (no import cycle: scaffold.ts does not import bundle.ts); in loadBundle's null-concept branch, only call warnings.add(...) when posix.basename(rel, ".md") is NOT in RESERVED_STEMS.
5. Tests: update test/bundle.test.ts's existing "warns on frontmatter-less markdown" test (it used adr/index.md as its example -- now suppressed, so retarget it to a non-reserved stem) and add a new dedicated suppression test; add paired "silent for reserved stems / still warns for a stray file" regression tests to link.test.ts (covers both link and unlink), sync.test.ts, and tasks.test.ts; add a harmonization-parity test to check.test.ts (proves check stays silent on the same reserved files, the target the others were harmonized to) and to validate.test.ts (proves skippedCount counts them with zero stderr noise).
6. Verify: bun test, bun run typecheck, bun run lint, bun run src/cli.ts check (the repo's own docs/ bundle, which has real docs/log.md + docs/{adr,reference,runbooks,specs}/index.md -- the exact fixture that reproduced the bug).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification (all green, run from the worktree root):
- bun test -> 2072 pass, 0 fail (47 files, 5846 expect() calls), including 8 new/updated regression tests covering the reserved-stem suppression: test/bundle.test.ts (updated the pre-existing "warns on frontmatter-less markdown" test to use a non-reserved fixture + added a dedicated reserved-stem-silence test), test/link.test.ts (3 new tests: link silent, link/unlink still warn on a genuine stray file, unlink silent), test/sync.test.ts (2 new tests), test/tasks.test.ts (2 new tests), test/check.test.ts (1 new parity test), test/validate.test.ts (1 new reconciliation test).
- bun run typecheck -> clean (tsc --noEmit, no errors); confirms importing RESERVED_STEMS from core/scaffold.ts into core/bundle.ts introduces no circular-import type errors.
- bun run lint -> clean (biome check ., "Checked 109 files ... No fixes applied.").
- bun run src/cli.ts check (the repo's own docs/ bundle, which has a real docs/log.md plus docs/{adr,reference,runbooks,specs}/index.md -- the exact fixture LCLI-258 was filed against) -> "38 files, 0 errors, 0 warnings", exit 0.
- Manual repro before/after: `bun run src/cli.ts sync --dry-run` and `bun run src/cli.ts tasks` on the repo's own docs/ previously printed 6 lines of "warning: skipping <path>: no frontmatter mapping, treated as a non-concept file" (adr/index.md, log.md, reference/index.md, runbooks/index.md, specs/index.md); after the fix both commands print none. `lore check` was silent before and after (unchanged). A genuine stray non-concept file (docs/stray.md, non-reserved stem) still warns via sync/link/tasks after the fix -- confirmed against a fresh `lore init`-scaffolded temp bundle.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root cause: link, unlink (shares link.ts), sync, and tasks were the only commands that call loadBundle(docsRoot, { warnings: advisories }); check does its own file scan (never calling loadBundle, deliberately, per LCLI-27) and validate calls tryParseConcept directly per-file (already tallying a clean skippedCount with no per-file warning) -- so the noisy "no frontmatter mapping" advisory only ever fired from bundle.ts's loadBundle() for those four commands.

Fix (suppression, scoped to reserved stems): core/bundle.ts's loadBundle now imports RESERVED_STEMS from core/scaffold.ts and skips emitting the "no frontmatter mapping" advisory when the skipped file's stem (index/log) is reserved -- these are lore's own machine-generated hubs (indexes.ts/log.ts), always frontmatter-free below the bundle root, so warning about them was pure noise. A genuinely unexpected non-concept file (any other stem) still warns, unchanged. This is the single shared choke point, so link/unlink/sync/tasks (and, as a side benefit, every other loadBundle-backed command: graph/query/context/orphans/supersede/rename) are fixed uniformly with no per-command logic. validate's behavior needed no change -- it already never emits this per-file warning, reserved stem or not, only a skippedCount -- and is now the pinned reconciliation target (test added). check needed no change either (it never called loadBundle for this).

Verified: bun test (2072 pass/0 fail, including 9 new/updated regression tests across bundle/link/sync/tasks/check/validate.test.ts), bun run typecheck (clean), bun run lint (clean), and bun run src/cli.ts check against the repo's own docs/ bundle (0 errors, 0 warnings) -- the same bundle whose real docs/log.md + 4 child index.md files reproduced the original bug (confirmed by manual before/after repro of `lore sync --dry-run` / `lore tasks`, which dropped from 6 spurious warning lines to 0).
<!-- SECTION:FINAL_SUMMARY:END -->
