---
id: LORE-5
title: Open the upstream --json PR and migrate lore on release
status: In Progress
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-07-13 12:53'
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

Re-parked task resumed 2026-07-13. Verified upstream state first: no existing
--json output support in MrLesk/Backlog.md (grepped current source, README,
CHANGELOG; searched open/closed issues and PRs for "json"/"--json" -- no hits
related to CLI --json output). Also found our fork's task ID collides:
backlog/tasks/back-510-*.md on our branch (tasks/back-510-json-output) now
collides with upstream main's own unrelated back-510 (Fix repeated task edit
label flags) -- our branch is 113 commits behind upstream/main, 3 ahead with
our own --json work. A fresh task ID via their CLI allocator will be needed
before any PR.

Reviewed upstream's actual contribution process (AGENTS.md + .github/
PULL_REQUEST_TEMPLATE.md) before acting, per this task's own AC#1 spirit:
they explicitly want a scoped issue opened and discussed BEFORE any PR --
"Investigations should not create implementation PRs by default... PRs
should normally link to a scoped issue first." Drafted a scope-only issue
(no mention of our existing fork/prototype/implementation, to avoid
presupposing the outcome before maintainers weigh in), iterated on it with
the user (dropped a self-promotional project link, then dropped all
references to already having a working implementation), got explicit
sign-off, and opened it:
https://github.com/MrLesk/Backlog.md/issues/784

NEXT: wait for maintainer response on scope/shape before doing any rebase
or PR work. Do not open a PR against this repo until that discussion
resolves -- that is the whole point of asking first.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-01 16:37
---
Parked: upstreaming deferred; durable git-dep + version-floor work moved to LORE-2/LORE-21. Re-scope recorded in notes.
---
<!-- COMMENTS:END -->
