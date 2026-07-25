---
id: LORE-265
title: >-
  ADR-0009 §2 misdescribes how lore orphans finds unowned tasks (stale search
  --json claim + missing parent-chain clause)
status: To Do
assignee: []
created_date: '2026-07-25 17:58'
labels:
  - docs-drift
  - adapter-backlog
  - cmd-meta-a
dependencies: []
priority: low
type: bug
ordinal: 367000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
ADR-0009 §2's description of the `lore orphans` rule should match what `src/commands/orphans.ts` actually does, so the canonical decision record stops misdescribing the implementation it governs.

## Observed
ADR-0009 (`docs/adr/0009-story-task-coupling-reconciliation.md`) §2 states that `lore orphans` "queries \`backlog task list --json\` (and \`backlog search --json\`) for tasks lacking any \`doc:\` label". Two inaccuracies, one pre-existing and one new:

1. **Pre-existing (predates LORE-261).** `orphans.ts` calls only `probe()` and `listTasks()` — it never calls `searchByLabel`/`searchTasks`. It also already consulted concepts' forward `tasks:` refs, not just the absence of a `doc:` label, so 'lacking any doc: label' was already an incomplete statement of the rule.
2. **New in LORE-261 (Done).** The rule now also walks the Backlog `parentTaskId` ancestor chain: a task is exempt when any ancestor is itself owned. ADR-0009 §2 does not mention this at all.

## Why it matters
This is a documentation-native project and ADR-0009 is the canonical home for the Story/Task coupling and orphan-detection rules. LORE-261's review found a source docstring in `orphans.ts` citing ADR-0009 §2 as authority for a claim that section does not actually make (fixed in `cac03fa`) — the underlying cause is that the ADR itself is behind the implementation. Same class as LORE-60 (ADR-0002 overstating the capability-probe exit code).

## Scope note
LORE-261 deliberately did NOT fix this: correcting it properly means also fixing drift that predates that task, which was outside its reviewed diff. Filed by the wave-3 orchestrator at the LORE-261 reviewer's recommendation.

## Refs
docs/adr/0009-story-task-coupling-reconciliation.md (§2, approx. lines 78-119), src/commands/orphans.ts (`hasOwnedAncestor`, `computeOrphans`), docs/reference/cli-surface.md (orphans entry, already accurate).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0009 §2 no longer claims 'lore orphans' uses 'backlog search --json'; the described data source matches what orphans.ts actually calls (probe + listTasks only).
- [ ] #2 ADR-0009 §2 describes the full current ownership rule: a task is not an orphan when it carries a 'doc:' label, OR is forward-referenced by a concept's 'tasks:' list, OR has an ancestor in its Backlog parent/subtask chain that is itself owned (LORE-261).
- [ ] #3 Any other prose in docs/ describing the orphans rule is checked for the same drift and corrected or confirmed accurate; 'lore check' stays green.
- [ ] #4 No behavior change — this is documentation only; the full suite stays green.
<!-- AC:END -->
