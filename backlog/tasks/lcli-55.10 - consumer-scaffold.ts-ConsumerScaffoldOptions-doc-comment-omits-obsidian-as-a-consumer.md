---
id: LCLI-55.10
title: >-
  consumer-scaffold.ts: ConsumerScaffoldOptions doc comment omits obsidian as a
  consumer
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:10'
labels:
  - docs
  - core
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
modified_files:
  - src/core/consumer-scaffold.ts
parent_task_id: LCLI-55
priority: low
type: docs
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ConsumerScaffoldOptions's doc comment (and its timestamp/profile field docs) still say the type exists for buildMkdocsScaffold and buildDocusaurusScaffold only, though this diff adds buildObsidianScaffold as a third consumer that ignores every field (the parameter is prefixed _options for exactly that reason). A maintainer who later changes those fields' handling because "only buildDocusaurusScaffold ignores this, per the doc" can miss that buildObsidianScaffold silently depends on the same fields staying optional/ignorable, with nothing -- doc or test -- flagging obsidian as a stakeholder in that decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ConsumerScaffoldOptions's doc comment and its timestamp/profile field docs mention buildObsidianScaffold alongside buildDocusaurusScaffold as a consumer that ignores these fields
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Update ConsumerScaffoldOptions's interface doc comment plus its timestamp/profile/siteName field docs (core/consumer-scaffold.ts) to name buildObsidianScaffold alongside buildDocusaurusScaffold wherever they describe which builder(s) ignore a field.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated the interface-level doc plus timestamp and profile field docs per the AC. Also updated siteName's field doc to note buildObsidianScaffold ignores it too (buildObsidianScaffold's own docstring already stated it ignores 'every options field'; siteName's own doc previously didn't disclaim any third builder) -- not explicitly named in the AC, but directly needed for the same interface's doc block to stay internally consistent once timestamp/profile call out obsidian and siteName silently doesn't. Verified via typecheck + full test suite (1497 pass) + lint clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ConsumerScaffoldOptions's doc comment and all three field docs (timestamp, siteName, profile) now name buildObsidianScaffold alongside buildDocusaurusScaffold as builders that ignore them. Verified: typecheck, lint, and full test suite (1497 pass) all clean.
<!-- SECTION:FINAL_SUMMARY:END -->
