---
id: LORE-5
title: Open the upstream --json PR and migrate lore on release
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:28'
labels:
  - backlog-fork
  - upstream
milestone: m-0
dependencies:
  - LORE-3
  - LORE-4
documentation:
  - docs/runbooks/backlog-json-patch.md
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Open a minimal PR (list/view/search) vs upstream main on branch tasks/back-XXX-json-output; once released, switch lore from the fork git-dep to the published backlog.md and bump the min-version floor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Upstream PR opened and linked
- [ ] #2 lore min-version floor documented for the --json release
<!-- AC:END -->
