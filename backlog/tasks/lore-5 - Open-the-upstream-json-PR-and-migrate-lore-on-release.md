---
id: LORE-5
title: Open the upstream --json PR and migrate lore on release
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-07-01 16:37'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PARKED at Phase 2 start (per master plan review-entire-backlog-of-mutable-origami.md, sections lines 21/112-114/189-191). Re-scope: the durable part — consume the fork as a locally-compiled git dependency + wire lore's capability probe / min-version floor — is owned by LORE-2 + LORE-21 (runbook backlog-json-patch.md section 6). LORE-5's remaining unique scope is the UPSTREAM PR to MrLesk/Backlog.md and migrate-on-release; that is DEFERRED. Verified there is NO upstream issue or PR for --json today. Do not open one until we choose to upstream. No status verb for 'parked' exists (statuses = To Do/In Progress/Done); left To Do but blocked behind LORE-3/LORE-4 and gated by this decision.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-01 16:37
---
Parked: upstreaming deferred; durable git-dep + version-floor work moved to LORE-2/LORE-21. Re-scope recorded in notes.
---
<!-- COMMENTS:END -->
