---
id: LORE-202
title: >-
  Correct order.ts module-doc rationale: default Array.prototype.sort is
  code-unit-ordered and stable, not locale/engine-dependent
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-engine-b
  - codex-review-followup
  - docs
dependencies: []
priority: low
type: docs
ordinal: 304000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** the order.ts module doc justifies the shared compareCodeUnits comparator with an accurate rationale.

**Why:** src/core/order.ts:3-4 currently says compareCodeUnits is "stable and locale-independent (unlike the default `Array.prototype.sort`, which sorts by locale and is engine-dependent)". Per ECMA-262, the no-comparator default sorts by UTF-16 code-unit order after ToString (it is not locale-aware) and has been required to be stable since ES2019 — so for string arrays the default already matches compareCodeUnits. The real justification for the explicit comparator is a single named determinism primitive that can never be spelled two ways and can never be accidentally a locale-aware compare (e.g. localeCompare) — not that the default is locale/engine-dependent. The comparator implementation (order.ts:11-13) is correct and must not change.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity, cluster core-engine-b.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The order.ts module doc no longer states the default `Array.prototype.sort` "sorts by locale" or is "engine-dependent" for its ordering.
- [ ] #2 The revised rationale accurately explains why an explicit shared code-unit comparator is kept (single source of truth / explicit UTF-16 code-unit ordering, avoiding an accidental locale-aware comparison) and is consistent with ECMA-262 (code-unit default, stable since ES2019).
- [ ] #3 No behaviour change: the compareCodeUnits implementation is untouched and the full `bun test` suite stays green.
<!-- AC:END -->
