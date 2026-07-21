---
id: LORE-75
title: >-
  lore schema export --out can irreversibly delete unrelated files outside its
  own directory
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 14:22'
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
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A full schema export prunes orphaned *.schema.json files from the resolved --out directory by filename suffix only, with no check that the directory is lore-owned. Running `lore schema export --out .` (or any directory that happens to contain unrelated *.schema.json files) silently and irreversibly deletes those files with no confirmation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pruneOrphans only deletes files inside a directory lore itself created/owns for schema export (e.g. requires a marker file, or restricts pruning to the default .lore/schemas/ path unless explicitly opted in)
- [x] #2 Exporting to an arbitrary pre-existing directory containing unrelated *.schema.json files does not delete them, or requires an explicit opt-in flag with a warning
- [x] #3 A test covers exporting into a directory with an unrelated *.schema.json file and asserts it survives
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Restrict pruneOrphans to only run when --out resolves to the default managed
   directory (.lore/schemas/), per AC#1's "restricts pruning to the default
   .lore/schemas/ path unless explicitly opted in" option -- the simplest of
   AC#1's two illustrative shapes and consistent with schema.ts's own existing
   doc comment that a non-default --out is "for ad-hoc/CI use" only.
2. In src/commands/schema.ts: add a helper (e.g. isManagedSchemasDir(absOutDir,
   root)) comparing absOutDir against resolve(root, SCHEMAS_DIR). Only call
   pruneOrphans when a full export (only === undefined) AND the resolved --out
   is the managed default dir. A non-default --out (including --out ".", the
   repo root) never prunes, satisfying AC#2 (pre-existing unrelated
   *.schema.json files in an arbitrary directory are never deleted).
3. Update pruneOrphans' and runSchema's doc comments to reflect the narrowed
   contract (prune is now confined to the lore-owned default directory, not
   any --out).
4. AC#3: add a test in test/schema-export.test.ts exporting (full export, no
   --type) into a non-default --out directory that already contains an
   unrelated *.schema.json file, and assert the file survives after the
   export. Also add the --out "." (repo root) case per the handover's own
   sharpest repro, since confineOutDir explicitly allows it.
5. Verify via git stash: confirm the new test(s) genuinely fail against
   today's unfixed code (unrelated file gets deleted) before applying the fix,
   then confirm they pass after.
6. Run bun test / lint / typecheck; run the real CLI against a scratch repo
   with `lore schema export --out .` containing an unrelated *.schema.json to
   confirm live behavior, not just the synthetic suite.
7. Independent adversarial review (general-purpose subagent) before merge —
   LORE-75 is destructive (irreversible rmSync) despite not being
   security-labeled; treat with the same rigor as this campaign's
   security-labeled tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented option (a) from the handover's design question: pruneOrphans now
only runs for a full export whose --out resolves to the managed default
directory (.lore/schemas/), via new isManagedSchemasDir(absOutDir, root)
helper in src/commands/schema.ts. A non-default --out (including --out .,
the repo root) never prunes, regardless of full vs --type export.

Verification:
- Wrote the two new AC#3 tests FIRST against unfixed code; both genuinely
  failed (unrelated file was deleted), confirming the vulnerability before
  fixing.
- After the fix: bun test (1644 pass/0 fail across 45 files), bun run
  typecheck (clean), bun run lint (0 errors, 4 pre-existing infos in
  unrelated test files, exit 0) all pass.
- Live-CLI verification against a real scratch repo (not just synthetic
  fixtures): `lore schema export --out .` with a pre-existing
  unrelated.schema.json at repo root -> file survives; `lore schema export
  --out other-out` with a pre-existing ghost.schema.json -> file survives;
  default `.lore schema export` with a stale ghost.schema.json in
  .lore/schemas/ -> still correctly pruned (regression check, prune behavior
  for the managed default dir is unchanged).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Confined lore schema export's orphan-pruning to the managed default directory
(.lore/schemas/) only. Added isManagedSchemasDir(absOutDir, root) in
src/commands/schema.ts; pruneOrphans is now called only when a full export's
resolved --out equals resolve(root, SCHEMAS_DIR). A non-default --out
(including --out ., the repo root, which confineOutDir already permits) never
prunes, so pre-existing unrelated *.schema.json files there are never
deleted.

Verified: two new tests (test/schema-export.test.ts) written against unfixed
code first and confirmed to genuinely fail (proving the vulnerability), then
pass after the fix. Full suite green (bun test: 1644/1644), typecheck clean,
lint 0 errors (4 pre-existing infos, unrelated files). Live-CLI verification
against a real scratch repo (not just synthetic fixtures) for both --out .
and a non-default --out dir: unrelated files survive; default-dir pruning
regression-checked and still works correctly.
<!-- SECTION:FINAL_SUMMARY:END -->
