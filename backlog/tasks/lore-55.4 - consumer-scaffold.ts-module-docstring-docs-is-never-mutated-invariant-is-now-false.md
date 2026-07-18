---
id: LORE-55.4
title: >-
  consumer-scaffold.ts module docstring: "docs/ is never mutated" invariant is
  now false
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
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
core/consumer-scaffold.ts's module docstring states the cross-target invariant "docs/ is never mutated to satisfy a consumer" (ADR-0010 §2), but buildObsidianScaffold (added in LORE-41) writes its output (docs/.obsidian/app.json) inside docs/ itself. A future contributor trusting this claim at face value when deciding whether a new builder may write inside docs/ could wrongly relocate obsidian's output outside docs/ (breaking Obsidian's vault-scoping requirement -- consumer-compatibility.md §3.2 requires docs/ itself be the vault) or wrongly assume a genuinely new docs/-internal consumer is disallowed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module docstring is updated to state the obsidian exception explicitly (docs/.obsidian/app.json is the one intentional exception, and why)
<!-- AC:END -->
