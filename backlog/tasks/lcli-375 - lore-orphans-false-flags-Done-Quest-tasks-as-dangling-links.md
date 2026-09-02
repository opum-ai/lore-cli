---
id: LCLI-375
title: lore orphans false-flags Done Quest tasks as dangling links
status: To Do
assignee: []
created_date: '2026-09-02 20:19'
labels: []
dependencies: []
references:
  - >-
    Reported in an issues dump relayed via opum-agent from other agents'
    lore/quest sessions
  - >-
    2026-09-02 (originally filed by the reporting agent as CON-15 in their own
    tracker); independently reproduced and found worse than described against
    quest 0.3.0
modified_files:
  - src/commands/orphans.ts
  - src/adapters/quest.ts
priority: high
type: bug
ordinal: 502000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After a task is correctly linked (lore link) and then driven to Quest's terminal Done status, lore orphans --json reports the linked Story as a danglingLink -- a false positive on a task that still exists and is still correctly linked. Root cause chain: src/adapters/quest.ts:238 listTasks calls a bare quest task list --json with no status override; Quest 0.3.0's task list silently drops terminal-status tasks from that bare call, and no --status/--exclude-status/--all flag currently makes it include them (a Quest-side gap, not just a missing flag lore forgets to pass -- quest task view and quest search both still resolve the Done task correctly). orphans.ts:197-198 builds its known-tasks set purely from that same filtered snapshot, so a real, Done, correctly-linked task reads as vanished. Notably lore check does NOT stay green in this state (contrary to the original report) -- it exits 6 (status-drift/managed-block-drift) via commands/reconcile-shared.ts's separate per-task verifiedViewTask path, which correctly sees Done. orphans and check therefore disagree with each other about the same repo state on the same underlying data source, and neither is aware of the other's blind spot.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore orphans' known-tasks resolution does not rely solely on the bulk listTasks snapshot for existence checks -- either query per-task state (matching reconcile-shared.ts's already-correct verifiedViewTask approach) or otherwise avoid the terminal-status blind spot
- [ ] #2 a Done, correctly-linked task is never reported as a danglingLink by lore orphans
- [ ] #3 regression test links a task, drives it to Done via the tracker, and asserts lore orphans reports it as linked/healthy rather than dangling
- [ ] #4 if closing this fully depends on a Quest-side fix (Quest 0.3.0 has no way via task list to retrieve terminal-status tasks at all), that dependency is stated explicitly rather than assumed fixable in lore-cli alone -- coordinate with quest-cli before committing to a specific lore-side approach
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Confirmed 2026-09-02 against dev source + quest 0.3.0. Linked T-1 to a Story via lore link, drove it To Do -> In Progress -> Done via quest task complete. Bare quest task list --json then returned data:[] (T-1 missing); quest task list --status Done --json and --status done --json BOTH also returned [] -- no working flag found to retrieve it via task list. quest task view T-1 --json and quest search <text> --json both correctly showed status Done. lore orphans --json then reported the Story under danglingLinks. Separately, lore check did NOT stay green (exit 6, status-drift + managed-block-drift) because reconcile-shared.ts's verifiedViewTask is per-task and correctly resolved Done -- so orphans and check actively disagree on this exact state. Needs coordination with quest-cli: confirm whether a stable flag/flag-combination to retrieve terminal tasks via task list exists or is planned, since orphans.ts's fix shape depends on it.
<!-- SECTION:PLAN:END -->
