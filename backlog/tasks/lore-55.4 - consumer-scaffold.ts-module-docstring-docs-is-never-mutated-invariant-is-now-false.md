---
id: LORE-55.4
title: >-
  consumer-scaffold.ts module docstring: "docs/ is never mutated" invariant is
  now false
status: Done
assignee:
  - '@claude'
created_date: '2026-07-18 22:54'
updated_date: '2026-07-19 00:06'
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
- [x] #1 The module docstring is updated to state the obsidian exception explicitly (docs/.obsidian/app.json is the one intentional exception, and why)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rewrite core/consumer-scaffold.ts's module docstring (the docs/ is never mutated claim) to state buildObsidianScaffold's docs/.obsidian/app.json write as the one intentional exception, and explain why (Obsidian's vault-scoping requirement needs docs/ itself to be the vault root, consumer-compatibility.md §3.2).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Edited src/core/consumer-scaffold.ts's module docstring (lines ~5-9). Verified via typecheck + full test suite (1497 pass) + lint clean on the changed file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
core/consumer-scaffold.ts's module docstring now names buildObsidianScaffold's docs/.obsidian/app.json write as the one intentional exception to the 'docs/ is never mutated' invariant, with the vault-scoping rationale inline. Verified: typecheck, lint, and full test suite (1497 pass) all clean.
<!-- SECTION:FINAL_SUMMARY:END -->
