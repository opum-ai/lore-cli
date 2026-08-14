---
id: LCLI-315
title: >-
  Pluggable tracker backends: choose the issue tracker instead of hardcoding
  Backlog.md
status: To Do
assignee: []
created_date: '2026-08-04 21:48'
updated_date: '2026-08-14 11:00'
labels:
  - 'doc:stories/track-lore-cli-tracker-backend-integration'
dependencies: []
documentation:
  - docs/reference/backlog-cli-contract.md
  - docs/stories/track-lore-cli-tracker-backend-integration.md
priority: medium
type: feature
ordinal: 434000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore's Story/Task coupling is hardwired to Backlog.md. There is exactly one tracker adapter (`src/adapters/backlog.ts`), no backend abstraction, and no config knob: four call sites construct it directly with `createBacklogAdapter(bunBacklogSpawn(...))` — `src/commands/link.ts:558`, `src/commands/export.ts:34`, and `src/core/ladybug-source.ts:182,338` — and a fifth path reads the status flow out of Backlog's own config file through the free function `readStatusFlow` (`src/adapters/backlog.ts:1059`, called from `src/commands/reconcile-shared.ts:106`).

Teams that do not use Backlog.md therefore cannot use lore's task coupling at all. This initiative makes the tracker a choice: keep Backlog.md as the default and add JIRA Cloud as a second backend, selected by config and offered by the `lore init` wizard.

Design constraint that shapes everything below: lore runs as a bare subprocess with no LLM or MCP session in the loop — `lore sync` from a plain terminal is the normal case. A tracker backend therefore cannot depend on MCP tools; it needs standalone credentials and its own transport.

Prior design research exists but is not authoritative and was not written against this repo: a superseded spec was drafted on the mbam5 host in `~/repos/evolv-ultra`. Its substance is carried into the subtasks here. Treat this repo's source as the ground truth and do not import that repo's ADR numbering or conventions.

Scope note: Quest CLI is intended as the eventual default backend, but `@opum-ai/quest` is unpublished (registry 404 as of 2026-08-04). Per this repo's CLAUDE.md, nothing in this initiative may ship an artifact implying Quest is available — see LCLI-315.4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A tracker backend is selected by configuration, with Backlog.md as the default and zero behavior change for existing repos
- [ ] #2 JIRA Cloud works as a second backend for the full Story/Task coupling surface
- [ ] #3 lore init offers the tracker choice interactively and via a flag, honoring the existing non-interactive contract
- [ ] #4 All subtasks are Done
<!-- AC:END -->
