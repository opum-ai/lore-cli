---
id: LORE-55.10
title: >-
  consumer-scaffold.ts: ConsumerScaffoldOptions doc comment omits obsidian as a
  consumer
status: To Do
assignee: []
created_date: '2026-07-18 22:55'
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
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ConsumerScaffoldOptions's doc comment (and its timestamp/profile field docs) still say the type exists for buildMkdocsScaffold and buildDocusaurusScaffold only, though this diff adds buildObsidianScaffold as a third consumer that ignores every field (the parameter is prefixed _options for exactly that reason). A maintainer who later changes those fields' handling because "only buildDocusaurusScaffold ignores this, per the doc" can miss that buildObsidianScaffold silently depends on the same fields staying optional/ignorable, with nothing -- doc or test -- flagging obsidian as a stakeholder in that decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ConsumerScaffoldOptions's doc comment and its timestamp/profile field docs mention buildObsidianScaffold alongside buildDocusaurusScaffold as a consumer that ignores these fields
<!-- AC:END -->
