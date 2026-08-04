---
id: LCLI-123
title: schema export follows a symlink planted at a schema file's leaf path
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - codex-review-followup
  - cmd-meta-a
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: medium
type: bug
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
confineOutDir (src/commands/schema.ts) only lexically confines the --out directory; LCLI-93/94 already closed the ancestor-directory-symlink escape for both the write and prune paths. However the per-file write loop in runSchema (schema.ts:107-111) calls writeFileOverwriting(join(options.root, file.path), ...) with no leaf-level symlink check on file.path itself. Reproduced against current code: planting a symlink at .lore/schemas/story.schema.json pointing to a file outside the repo, then running `lore schema export`, silently overwrites the outside file's contents through the symlink with no error, because plain writeFileSync follows a leaf symlink.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running `lore schema export` when a target schema file path (e.g. .lore/schemas/story.schema.json) is a symlink pointing outside the repo root fails with a denied/usage error instead of writing through the symlink.
- [x] #2 A regression test in test/schema-export.test.ts (or test/schema.test.ts) plants a leaf symlink at a schema output path pointing to an external file and asserts the export does not modify the external file's contents.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Swap schema.ts's per-file write loop from writeFileOverwriting to the existing leaf-symlink-safe writeFileNoFollow (fswrite.ts), updating the import; no change to fswrite.ts (LCLI-117 owns it this wave).
2. writeFileNoFollow already maps ELOOP to a conflict LoreError (same shape as the existing LCLI-93 ancestor-symlink guard), so no extra mapping in schema.ts is needed — verified against fswrite.ts's own implementation.
3. Add a regression test in test/schema-export.test.ts: run a full export, then replace .lore/schemas/story.schema.json with a symlink to an external file, re-run export, assert it throws a conflict LoreError and the external file's bytes are unchanged.
4. Verify with bun test test/schema-export.test.ts test/schema.test.ts, full bun test suite, and typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Swapped schema.ts's per-file write (schema.ts:110, import at :38) from writeFileOverwriting to the existing leaf-symlink-safe writeFileNoFollow (fswrite.ts:478, owned by sibling LCLI-117 — used as-is, not modified). writeFileNoFollow already maps ELOOP to a conflict LoreError with the same message shape as the LCLI-93 ancestor-symlink guard, so no additional error mapping was needed in schema.ts. Added a regression test (test/schema-export.test.ts, new describe block 'leaf-symlink guard on the written file itself (LCLI-123)'): seeds a normal export, replaces .lore/schemas/story.schema.json with a symlink to an external tmp file, re-runs export, and asserts a conflict LoreError is thrown and the external file's bytes are unchanged (POSIX-only, matching the codebase's existing symlink-test skip convention).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the leaf-symlink write-through in lore schema export: schema.ts's per-file write loop now calls writeFileNoFollow instead of writeFileOverwriting, so a symlink planted at a schema output path (e.g. .lore/schemas/story.schema.json) pointing outside the repo refuses with a conflict LoreError (exit 5) instead of silently overwriting the external target. Verified with: bun test test/schema-export.test.ts test/schema.test.ts (61 pass/0 fail, including the new AC#2 regression test), full bun test (1730 pass/0 fail across 45 files), and bun run typecheck (tsc --noEmit, clean).
<!-- SECTION:FINAL_SUMMARY:END -->
