---
id: LORE-80
title: rewriteInbound shared engine does not confine fromId/toId to docs/ bundle root
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
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
core/rewrite.ts rewriteInbound (the shared engine behind both rename and supersede) never confines fromId/toId to the docs/ bundle root, and idFromPath performs no containment check either. This is the deepest layer of the same rename-destination-traversal gap found independently at the args.ts and rename.ts layers in this review; fixing containment here would close the gap for every caller of the shared engine at once, including supersede.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 rewriteInbound rejects (or callers are required to pre-validate) a fromId/toId that resolves outside the docs/ bundle root
- [ ] #2 A test covers rewriteInbound called directly with a traversal toId and asserts it is rejected
<!-- AC:END -->
