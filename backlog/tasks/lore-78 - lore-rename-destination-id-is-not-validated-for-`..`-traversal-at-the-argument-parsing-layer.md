---
id: LORE-78
title: >-
  lore rename destination id is not validated for `..` traversal at the
  argument-parsing layer
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
assertNotReservedStem and the rest of the id-parsing pipeline in args.ts validate only reserved basenames, never rejecting `..` segments in the destination id. This is the first of three layers (args parsing, the rename command, and the shared rewriteInbound engine) where the same rename-destination-traversal gap was independently found in this review; see also the rename.ts and rewrite.ts findings from the same review for the other two layers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The destination id argument is validated to reject `..` path segments before it reaches command execution, with a clear usage error
- [ ] #2 A test covers a destination id containing `..` and asserts it is rejected at argument-parsing time
<!-- AC:END -->
