---
id: LCLI-253
title: >-
  Migrate backlog adapter to the released --json Backlog.md once upstream tags
  it (drop build-from-commit hint, bump version floor)
status: To Do
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - adapter-backlog
  - release
  - blocked-upstream
dependencies: []
references:
  - src/adapters/backlog.ts
  - docs/runbooks/backlog-json-patch.md
  - 'https://github.com/MrLesk/Backlog.md/pull/790'
priority: high
type: task
ordinal: 355000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Once MrLesk/Backlog.md tags a release NEWER than v1.48.0 whose history contains commit 22a091b (PR #790 / BACK-545, stable --json output, merged 2026-07-16), migrate lore off the interim build-from-source flow to the published package. This is the single load-bearing, currently-untracked step gating lore's own first npm release.

## Why it matters
lore's adapter (src/adapters/backlog.ts) requires a --json-capable backlog. Today MIN_BACKLOG_VERSION is still 1.47.1 (the fork floor) and the RUNBOOK_HINT (~line 201) tells users to BUILD MrLesk/Backlog.md from commit 22a091b because no tagged release contains it yet. docker/e2e/Dockerfile pins BACKLOG_COMMIT=22a091b. LCLI-53's notes call this migrate-on-release swap a small follow-up 'not tracked separately' — so it has no task. Until it lands, lore cannot cut a clean first release (users can't just install a released backlog).

## Blocked on
An external event: MrLesk/Backlog.md tagging a release greater than v1.48.0 that includes commit 22a091b. Track that via the companion upstream-tag watch task. Not startable until then.

## Context
docs/runbooks/backlog-json-patch.md section 8.1; docs/runbooks/release-publishing.md Prerequisites; the LCLI-5 'Superseded' note (upstream shipped its own --json).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MIN_BACKLOG_VERSION in src/adapters/backlog.ts is raised from 1.47.1 to the tagged release version that ships --json, and the capability probe passes against the real PUBLISHED backlog binary.
- [ ] #2 The RUNBOOK_HINT no longer instructs building from commit 22a091b; it points at installing the published backlog.md at or past that release version.
- [ ] #3 docker/e2e/Dockerfile no longer pins BACKLOG_COMMIT=22a091b; it uses the released version/tag, and docker-e2e stays green against it.
- [ ] #4 docs/runbooks/backlog-json-patch.md and README present the published-package install path as primary; the superseded fork/build-from-source content is clearly demoted or removed.
- [ ] #5 Full test suite and docker-e2e are green against the real released --json backlog.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Related workflow gap surfaced during local testing (2026-07-24)

'backlog task create' has no machine-readable id output: the upstream --json PR (#790) added JSON only to the READ commands (task list / view / search), NOT to create. So the create->link round-trip (e.g. lore's own e2e and any 'create a task then couple it to a Story' flow) must fall back to 'backlog task list --json | .tasks[0].id', which is fragile on a bundle that already has tasks (the newest isn't reliably first). Two possible fixes to weigh when this migration lands:
- Upstream: request/track 'backlog task create --json' (emit the created id) — the clean fix, belongs with the adapter migration.
- lore-side convenience: a 'lore link --create-task "<title>"' (or 'lore new task') that creates the backlog task AND couples it in one step, so the id never has to be round-tripped by the caller.
Not blocking this task; captured here so it is considered alongside the version-floor/adapter work rather than lost.
<!-- SECTION:NOTES:END -->
