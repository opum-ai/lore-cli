---
id: LORE-167
title: validateFrontmatter misclassifies differently-cased known types as unknown
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-scaffold-consumer
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`validateFrontmatter` (src/core/schema.ts:159-186) looks up `profile.types.get(type)` at line 164 using the value `requireType` returns, which is only trimmed, never case-canonicalized. The `types` Map is keyed by each type's canonical casing (e.g. `"Story"`), and only `canonicalType()` (schema.ts:100-103) consults the lowercase `byLowerName` map to fold casing — but `validateFrontmatter` never calls `canonicalType` before its lookup. As a result, a frontmatter block with `type: story` (or any other differently-cased spelling of a real profile type) falls into the `compiled === undefined` branch at line 165-170, is only warned as an "unknown type", and skips the type's actual schema validation entirely — silently letting malformed fields through for a type that should have been strictly checked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A frontmatter object with `type: story` (or another differently-cased spelling of a known profile type like `Story`) is validated against that type's real compiled schema in `validateFrontmatter`, not treated as an unknown producer-extension type.
- [ ] #2 test/schema.test.ts gains a regression case asserting that a differently-cased known type both resolves to the type's schema (errors are thrown for a field mismatch) and does not emit an "unknown type" warning.
<!-- AC:END -->
