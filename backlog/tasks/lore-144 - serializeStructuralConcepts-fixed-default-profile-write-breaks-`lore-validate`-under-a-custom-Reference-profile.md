---
id: LORE-144
title: >-
  serializeStructuralConcept's fixed default-profile write breaks `lore
  validate` under a custom Reference profile
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-engine-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
serializeStructuralConcept (src/core/scaffold.ts:163-168) always serializes lore-owned reserved files like the scaffolded root `docs/index.md` against the built-in `defaultProfile()`, deliberately ignoring the project's active profile (per its own docstring, so a custom profile can never break a scaffold command). However, `lore validate` (src/commands/validate.ts:71-76) loads the *active* project profile and `validateFrontmatter` (src/core/schema.ts:159-186) validates every file, including docs/index.md with no exemption, against that active profile's compiled schema. If the active profile adds a required field to the `Reference` type, `lore init` writes an index.md that is valid against the default profile but immediately fails `lore validate` — a freshly scaffolded bundle cannot pass its own first validation check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running `lore init` followed immediately by `lore validate` succeeds (no thrown/reported error on docs/index.md) even when the project's active profile adds a required field to the `Reference` type.
- [ ] #2 A regression test covering this init-then-validate sequence exists (e.g. alongside scaffold/validate core tests) using a custom profile with a required field added to Reference, asserting no validation failure is reported for the scaffolded root index.
<!-- AC:END -->
