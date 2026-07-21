---
id: LORE-83
title: >-
  profile.toml field/type declarations silently ignore unknown or misspelled
  attribute keys
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
parseFieldSpec, parseTypes, and parseItems in profile.ts only read known attribute keys by name, with no unknown-key check. A typo like `require = true` (meant to be `required`) silently defaults required to false instead of erroring, so every concept validates clean even when missing that field. The documented forward-compatible unknown-key tolerance is explicitly scoped to only the top-level [profile] table, not nested field/type/item tables, so this silent tolerance is an unintended gap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An unrecognized key inside a [types.fields.*] (or equivalent type/item) table produces a validation error or warning at profile-load time, not silent tolerance
- [ ] #2 A test covers a misspelled attribute key (e.g. require instead of required) and asserts profile loading now flags it
<!-- AC:END -->
