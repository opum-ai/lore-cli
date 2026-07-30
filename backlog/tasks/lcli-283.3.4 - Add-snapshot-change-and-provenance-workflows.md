---
id: LCLI-283.3.4
title: Add snapshot change and provenance workflows
status: To Do
assignee: []
created_date: '2026-07-30 13:34'
labels:
  - ladybugdb
  - history
  - changed
  - provenance
  - graph-explorer
milestone: m-15
dependencies:
  - LCLI-283.3.3
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.3
priority: medium
type: enhancement
ordinal: 399000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use retained explicit projection snapshots to answer bounded changed-since and provenance questions and surface those workflows in the CLI and graph explorer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can compare explicit repository commits or workspace snapshots and retrieve added, removed, changed, and relationship-delta evidence within stable limits
- [ ] #2 Provenance traces each snapshot and result to repository, commit, export digest, bundle, record identity, and source path without treating derived layout or indexes as authored history
- [ ] #3 Retention and deletion are explicit and bounded; removed repositories or workspaces leave no unintended snapshot evidence
- [ ] #4 CLI and explorer views share conformance fixtures for empty diffs, renames, supersession, duplicate links, missing snapshots, truncation, and multi-repository changes
<!-- AC:END -->
