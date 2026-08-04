---
id: LORE-55.6
title: >-
  obsidian scaffold: stale JSDoc still names the old enumerated .gitignore
  patterns
status: Done
assignee:
  - '@claude'
created_date: '2026-07-18 22:54'
updated_date: '2026-07-19 00:07'
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
- [x] #1 The JSDoc on OBSIDIAN_APP_JSON_REL_PATH accurately describes the current exclude-all-except .gitignore pattern, not the old enumerated one
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rewrite the JSDoc on OBSIDIAN_APP_JSON_REL_PATH (core/consumer-scaffold.ts) to describe the current exclude-all-except .gitignore pattern (docs/.obsidian/* plus a !docs/.obsidian/app.json negation) instead of the old enumerated pattern (workspace*.json, cache), and note that a future file scaffolded under docs/.obsidian/ needs its own negation line.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Edited src/core/consumer-scaffold.ts's OBSIDIAN_APP_JSON_REL_PATH JSDoc. Cross-checked the new wording against the actual .gitignore content (lines 31-36) to confirm accuracy. Verified via typecheck + full test suite (1497 pass) + lint clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
OBSIDIAN_APP_JSON_REL_PATH's JSDoc now accurately describes the exclude-all-except .gitignore pattern (docs/.obsidian/* + !docs/.obsidian/app.json) instead of the stale enumerated-patterns claim, and flags that a future file under docs/.obsidian/ needs its own negation. Verified against .gitignore's actual content; typecheck, lint, and full test suite (1497 pass) all clean.
<!-- SECTION:FINAL_SUMMARY:END -->
