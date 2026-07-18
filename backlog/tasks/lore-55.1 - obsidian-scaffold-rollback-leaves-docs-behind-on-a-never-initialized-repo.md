---
id: LORE-55.1
title: 'obsidian scaffold: rollback leaves docs/ behind on a never-initialized repo'
status: To Do
assignee: []
created_date: '2026-07-18 22:54'
labels:
  - cmd
  - core
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/core/consumer-scaffold.ts
parent_task_id: LORE-55
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
- [ ] #1 buildObsidianScaffold's ConsumerScaffoldPlan.dirs lists every ancestor directory level (e.g. both "docs" and "docs/.obsidian"), matching core/scaffold.ts's pattern
- [ ] #2 A new regression test mirrors mkdocs's "rolls back the freshly-created directory on a later failure" case for obsidian against a never-initialized repo, and passes
<!-- AC:END -->
