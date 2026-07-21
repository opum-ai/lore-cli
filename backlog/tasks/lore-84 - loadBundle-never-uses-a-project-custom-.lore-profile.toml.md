---
id: LORE-84
title: loadBundle never uses a project custom .lore/profile.toml
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
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LoadBundleOptions has no profile field, so every command that calls loadBundle (query, context, graph, orphans, rename, tasks, sync, link, supersede) always validates concept frontmatter against the built-in default profile, even when the project defines a custom .lore/profile.toml with its own types/fields/enums. Some callers (sync.ts, supersede.ts) already load the profile separately but only use it for later serialization, never for the loadBundle call itself, confirming this is a real gap rather than a caller supplying it elsewhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 loadBundle accepts an optional Profile and forwards it to frontmatter validation for every concept it parses
- [ ] #2 Every existing loadBundle caller in a project with a custom profile passes that profile through, so validation matches the project own schema, not the built-in default
- [ ] #3 A test covers a bundle with a custom profile type/field and asserts loadBundle validates against it correctly
<!-- AC:END -->
