---
id: LCLI-347
title: Settle Wave A post-merge primary checkout and Treehouse housekeeping
status: Done
assignee:
  - lore-cli
created_date: '2026-08-21 17:10'
updated_date: '2026-08-21 17:19'
labels: []
dependencies: []
ordinal: 469000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After PR #411 (wave A) and PR #412 (treehouse pool identity) merged to dev, the primary checkout is on the now-gone feat/wave-a-output-tracker-hermes branch (HEAD fe331de, ancestor of origin/dev dd56b99). The primary has a dirty managed doc-25 settlement entry, an untracked completed LCLI-346 task file, untracked .lore/agents/ profiles, and an untracked opencode.jsonc. The legacy .treehouse/.treehouse/ pool directory contains two pool identities: lore-cli-f70589 (3 slots with unique feature work) and lore-cli-68bc63 (1 available slot). The .gitignore still carries the stale /.treehouse/.treehouse pattern from before the root normalization. This task settles the primary checkout to origin/dev, delivers the missing managed settlement artifacts through a focused dev PR, updates .gitignore, and records exact retained exceptions for all unique work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Primary checkout is on a branch tracking origin/dev at or beyond dd56b99
- [ ] #2 doc-25 settlement entry and completed LCLI-346 task file are committed and merged to dev
- [ ] #3 .gitignore removes the stale /.treehouse/.treehouse pattern
- [ ] #4 opencode.jsonc and .lore/agents/ are classified with explicit retain-or-ignore disposition
- [ ] #5 All retained worktrees have recorded owner, lease state, and cleanup condition
- [ ] #6 No unique work is lost; all retained branches are on owned refs
<!-- AC:END -->
