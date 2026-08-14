---
id: LCLI-315.4
title: Ship Quest as Lore default tracker backend after @opum-ai/quest is published
status: To Do
assignee: []
created_date: '2026-08-04 21:49'
updated_date: '2026-08-14 18:09'
labels:
  - quest
  - tracker
  - default-backend
  - quest-0.1-blocker
dependencies:
  - LCLI-315.1
parent_task_id: LCLI-315
priority: high
type: feature
ordinal: 438000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make Quest lore's default tracker backend only after Quest has a verified public release. The production adapter consumes the versioned subprocess contract delivered by quest-cli QCLI-83 and remains blocked until QCLI-95 confirms @opum-ai/quest is published and clean-installable by direct registry evidence.

For new bundles, lore init persists [tracker] backend = "quest" explicitly. Lore never silently invokes a committing quest init; when Quest is selected but uninitialized, it reports the exact initialization command. For existing bundles with no explicit tracker configuration but with Backlog artifacts, the first tracker-dependent interactive operation blocks and offers migration or explicit Backlog pinning; noninteractive use fails with exact commands. Existing explicit Backlog and Jira configurations remain unchanged. No silent fallback, automatic migration, or dual writing is permitted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 @opum-ai/quest is confirmed published on the public npm registry and QCLI-95 release evidence is checked before implementation begins
- [ ] #2 A Quest backend implements the full TrackerAdapter probe, status-flow, list, view, search, create, and edit contract from QCLI-83 with bounded subprocess execution
- [ ] #3 TrackerAdapter statusFlow becomes asynchronous so Lore queries Quest workflow configuration instead of duplicating it
- [ ] #4 New Lore bundles persist backend = "quest" explicitly and an uninitialized Quest workspace produces the exact quest init command without a silent committing mutation
- [ ] #5 An existing zero-config Backlog bundle is never switched silently: interactive callers choose migration or explicit pinning and noninteractive callers fail with exact commands
- [ ] #6 Explicit Backlog and Jira configurations remain honored, and missing or incompatible Quest never falls back or dual-writes
- [ ] #7 Unit, adapter-contract, init, legacy-bundle, noninteractive, timeout, missing-binary, incompatible-schema, and clean-install tests pass
<!-- AC:END -->
