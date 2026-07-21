---
id: LORE-134
title: >-
  resolveRef tries frontmatter ref as a root id before trying it as a relative
  path
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveRef (src/core/bundle.ts:429-448) computes `idFromPath(decoded)` and returns it immediately if that id exists in the bundle, before ever attempting to resolve `decoded` as a path relative to the referring file's directory via resolvePath. If an author writes an explicit relative (or `.md`-suffixed) ref that happens to normalize to the same string as a different, unrelated concept's bundle-root id, resolveRef silently binds the ref to that unrelated concept instead of the relative target the author meant, with no warning or error surfaced.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A frontmatter ref that is written as a relative/`.md`-suffixed path resolves to the concept found by joining it to the referring file's directory when that resolution succeeds, even if the same string also happens to match a distinct concept's bundle-root id.
- [ ] #2 A regression test in test/bundle.test.ts constructs a bundle where a relative ref's dir-relative resolution and its root-id resolution point at two different concepts, and asserts resolveRef returns the dir-relative (intended) target.
<!-- AC:END -->
