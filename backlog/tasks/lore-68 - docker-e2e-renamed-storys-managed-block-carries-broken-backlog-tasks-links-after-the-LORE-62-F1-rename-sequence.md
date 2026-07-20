---
id: LORE-68
title: >-
  docker/e2e: renamed-story's managed block carries broken backlog/tasks/ links
  after the LORE-62 F1 rename sequence
status: To Do
assignee: []
created_date: '2026-07-20 13:36'
labels:
  - e2e
  - bug
  - backlog-coupling
dependencies: []
priority: medium
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Discovered while implementing LORE-64 (declarative profile subsystem E2E coverage): a full `lore check --json` run against docker/e2e's scratch bundle, right after Phase 17 (schema export) and before any profile-subsystem changes, already reports 2 broken-link errors that have nothing to do with LORE-64:

```
{"severity":"error","rule":"broken-link","file":"stories/e2e-renamed-story-f1.md","message":"link \"../backlog/tasks/task-1%20-%20Design-the-archive-endpoint.md\" points at \"backlog/tasks/task-1 - Design-the-archive-endpoint.md\", which is not in the bundle"}
{"severity":"error","rule":"broken-link","file":"stories/e2e-renamed-story-f1.md","message":"link \"../backlog/tasks/task-2%20-%20Implement-the-archive-job.md\" points at \"backlog/tasks/task-2 - Implement-the-archive-job.md\", which is not in the bundle"}
```

This is a genuine, pre-existing gap: nothing in run-e2e.sh runs a full, unscoped `lore check` between Phase 9's drift loop and Phase 24's targeted exit-code checks, so this has silently gone undetected through every session of the backlog-campaign since Phase 15b/16 (the linked-rename + F1-induced-failure + supersede sequence) first ran.

Root-cause hypothesis (not yet confirmed): `src/core/managed-block.ts`'s `renderRow` builds each row's link from the linked task's own `file` field (the task's repo-relative path as Backlog's adapter reports it) via `normalizeLink`/`encodePathSegments`. The broken link's encoding is a mix of literal dashes ("Design-the-archive-endpoint") and %20-encoded spaces ("task-1%20-%20") in the SAME string — `encodePathSegments` only percent-encodes characters that are actually present in its input, so the dashes must already be in the `file` value the adapter reported, while the real on-disk filename apparently uses spaces instead (title created verbatim as "Design the archive endpoint" via `backlog task create`). That mismatch (Backlog's reported task file path using dashes where the real filename uses spaces, or vice-versa) looks like the same family of "Backlog.md's own data representation vs. its real filesystem convention diverge" issues already found in LORE-62 (task-id casing) and LORE-63 (status representation) — but this specific divergence (the task file PATH itself) has not been investigated.

Likely introduced during the Phase 15b linked-rename + F1-induced-backref-failure sequence (docker/e2e/run-e2e.sh), since the Story renamed there ("stories/e2e-renamed-story" -> "stories/e2e-renamed-story-f1") is the one file affected, and its managed-block row links were never regenerated (`lore sync`) after that rename.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root-cause confirmed: identify exactly which value (adapter-reported task file path vs. the real on-disk backlog/tasks/ filename) carries the wrong dash/space convention, and in which lore module or which real backlog binary behavior it originates
- [ ] #2 docker/e2e/run-e2e.sh's Phase 15b/16 sequence (or wherever the real cause lives) fixed so a full, unscoped 'lore check --json' run after Phase 17 (schema export) shows 0 broken-link findings
- [ ] #3 A full docker/e2e harness run (docker compose -f docker/e2e/docker-compose.yml up --build) is green, and a full 'lore check' at that point in the script is added as a regression guard so this gap cannot silently recur
<!-- AC:END -->
