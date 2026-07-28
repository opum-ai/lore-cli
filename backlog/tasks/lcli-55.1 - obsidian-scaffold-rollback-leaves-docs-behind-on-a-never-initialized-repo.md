---
id: LCLI-55.1
title: 'obsidian scaffold: rollback leaves docs/ behind on a never-initialized repo'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:15'
labels:
  - cmd
  - core
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/core/consumer-scaffold.ts
parent_task_id: LCLI-55
priority: medium
type: bug
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
buildObsidianScaffold's plan (src/core/consumer-scaffold.ts) lists only the nested leaf directory "docs/.obsidian", never its parent "docs", so writeAllOrRollback never tracks the implicitly-created docs/ for cleanup. Run `lore scaffold obsidian` against a repo with no docs/ yet and have the directory-creation or app.json write fail (EACCES/EPERM/ENOSPC); the command correctly errors and exits non-zero, but a stray, empty docs/ that did NOT exist before the run is left on disk afterward -- breaking the same all-or-nothing guarantee already fixed and regression-tested for mkdocs's structurally identical case (test/consumer-scaffold.test.ts:258, "a run against a repo with no docs/ rolls back the freshly-created directory on a later failure"). core/scaffold.ts's buildScaffold avoids this by listing every directory level explicitly (e.g. both ".lore" and ".lore/schemas" as separate dirs entries); buildObsidianScaffold does not do this for docs/docs.obsidian.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 buildObsidianScaffold's ConsumerScaffoldPlan.dirs lists every ancestor directory level (e.g. both "docs" and "docs/.obsidian"), matching core/scaffold.ts's pattern
- [x] #2 A new regression test mirrors mkdocs's "rolls back the freshly-created directory on a later failure" case for obsidian against a never-initialized repo, and passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add DOCS_DIR to buildObsidianScaffold's dirs array (src/core/consumer-scaffold.ts) so both ancestor levels ('docs', 'docs/.obsidian') are tracked by writeAllOrRollback, mirroring core/scaffold.ts's buildScaffold pattern.
2. Update the existing 'plans exactly docs/.obsidian/app.json' pure-builder test to assert plan.dirs === ['docs', 'docs/.obsidian'].
3. Add a regression test mirroring mkdocs's 'rolls back the freshly-created directory on a later failure' case: use a restrictive umask (0o222) so the freshly-created docs/ ends up read-only, causing the second planned dir (docs/.obsidian) to fail to be created inside it — a genuine later-step failure after docs/ was freshly created by the same run. Assert docs/ does not exist after the run.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed by adding DOCS_DIR to buildObsidianScaffold's dirs array (src/core/consumer-scaffold.ts:168). This single fix also resolves LCLI-55.3 for free: runScaffold's blockedDirs preflight (src/commands/scaffold.ts) filters plan.dirs generically, so once 'docs' is its own explicit entry, the existing non-directory-occupying-docs check fires without any scaffold.ts change. New regression test uses process.umask(0o222) to make the freshly-created docs/ read-only, forcing the second dirs entry (docs/.obsidian) to fail with EACCES/denied — a genuine later-step failure after docs/ was freshly created, mirroring mkdocs's own rollback regression test. Verified empirically in a scratch script before writing the test (mkdirSync with umask 0o222 -> mode 555 -> nested mkdir throws EACCES). All 1496 tests pass; typecheck and lint clean on changed files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added DOCS_DIR to buildObsidianScaffold's dirs array (src/core/consumer-scaffold.ts) so writeAllOrRollback tracks both 'docs' and 'docs/.obsidian' for cleanup, matching core/scaffold.ts's own explicit-ancestor-levels pattern. Verified with a new regression test (test/consumer-scaffold.test.ts) that uses a restrictive umask to force a genuine later-step failure after docs/ is freshly created, asserting docs/ is rolled back; full suite (1496 tests), typecheck, and lint all pass.
<!-- SECTION:FINAL_SUMMARY:END -->
