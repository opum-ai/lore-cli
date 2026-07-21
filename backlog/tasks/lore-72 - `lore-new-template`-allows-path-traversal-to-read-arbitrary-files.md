---
id: LORE-72
title: '`lore new --template` allows path traversal to read arbitrary files'
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
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The --template flag value is interpolated into a file path under .lore/templates/ with no basename or traversal validation. Reproduced directly: `lore new adr "Test" --template ../../../../../../tmp/outside_secret --out docs/adr/test.md` reads /tmp/outside_secret.md and copies its exact bytes into the generated concept, entirely outside .lore/templates/ and the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A --template value containing `..` segments or resolving outside .lore/templates/ is rejected with a clear usage error
- [ ] #2 An absolute-path --template value is likewise rejected
- [ ] #3 A test reproduces the traversal repro above and asserts it now fails instead of reading the outside file
<!-- AC:END -->
