---
id: LORE-79
title: >-
  lore rename destination path is not confined to docs/ root at the command
  layer
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
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The destination id (newId) in commands/rename.ts is never confined to the bundle root before assertTargetFree/commitWrites resolve and write to it. Reproduced directly: `lore rename reference/orders ../../../../tmp/pwned` relocates the renamed concept content outside docs/. commands/new.ts already guards this class of escape for --out via resolveOutPath; rename.ts has no equivalent. Related to the args.ts and rewrite.ts findings from the same review, which cover the other two layers of this same gap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 commands/rename.ts confines the resolved destination path to the bundle root before any write, mirroring resolveOutPath in commands/new.ts
- [ ] #2 A traversal or absolute destination id is rejected with a clear error before any file is moved or written
- [ ] #3 A test reproduces the traversal repro above and asserts it now fails
<!-- AC:END -->
