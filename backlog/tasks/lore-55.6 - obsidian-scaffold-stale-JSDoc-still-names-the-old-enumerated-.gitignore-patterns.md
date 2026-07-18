---
id: LORE-55.6
title: >-
  obsidian scaffold: stale JSDoc still names the old enumerated .gitignore
  patterns
status: To Do
assignee: []
created_date: '2026-07-18 22:54'
labels:
  - docs
  - core
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/core/consumer-scaffold.ts
parent_task_id: LORE-55
priority: low
type: docs
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The new JSDoc on OBSIDIAN_APP_JSON_REL_PATH (src/core/consumer-scaffold.ts) names the two enumerated .gitignore patterns (workspace*.json, cache) that this same diff's .gitignore hunk deletes and replaces with a broader exclude-all-except pair (docs/.obsidian/* + !docs/.obsidian/app.json) -- the comment is inaccurate the moment the PR lands. A later change scaffolding a second file under docs/.obsidian/ could trust this stale comment and omit the required !docs/.obsidian/<newfile> negation, silently dropping the new file from git add with no error raised.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The JSDoc on OBSIDIAN_APP_JSON_REL_PATH accurately describes the current exclude-all-except .gitignore pattern, not the old enumerated one
<!-- AC:END -->
