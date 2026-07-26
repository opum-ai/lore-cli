---
id: LORE-265
title: >-
  ADR-0009 §2 misdescribes how lore orphans finds unowned tasks (stale search
  --json claim + missing parent-chain clause)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 17:58'
updated_date: '2026-07-26 11:49'
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
- [x] #1 ADR-0009 §2 no longer claims 'lore orphans' uses 'backlog search --json'; the described data source matches what orphans.ts actually calls (probe + listTasks only).
- [x] #2 ADR-0009 §2 describes the full current ownership rule: a task is not an orphan when it carries a 'doc:' label, OR is forward-referenced by a concept's 'tasks:' list, OR has an ancestor in its Backlog parent/subtask chain that is itself owned (LORE-261).
- [x] #3 Any other prose in docs/ describing the orphans rule is checked for the same drift and corrected or confirmed accurate; 'lore check' stays green.
- [x] #4 No behavior change — this is documentation only; the full suite stays green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read src/commands/orphans.ts (hasOwnedAncestor/computeOrphans) as ground truth: orphans.ts calls only adapter.probe() + adapter.listTasks() (one unfiltered `backlog task list --json` snapshot) — never searchByLabel/searchTasks (`backlog search --json`), confirmed unused by grep across src/ and confirmed true since orphans' original LORE-32 commit. Ownership rule = NOT orphan iff hasDocLabel(task) OR referenced (some concept's tasks: forward-ref) OR hasOwnedAncestor (same two tests walked up task.parentTaskId chain, LORE-261).
2. Rewrite ADR-0009 section 2's second bullet (lines ~91-95: docs/adr/0009-story-task-coupling-reconciliation.md) to: (a) drop the stale "backlog search --json" claim, (b) state the single-snapshot read accurately, (c) describe the full three-part ownership rule (doc: label OR forward tasks: ref OR owned ancestor per LORE-261), (d) correct the false "Bulk unlink also keys off the label set" claim (unlink takes explicit task ids, never queries the label).
3. Sweep other docs/ prose for the same drift (stale search claim / incomplete rule) per AC#3: cli-surface.md (task says already-accurate, confirm), cli-contract.md, architecture.md, lore-design.md, backlog-json-schema.md, backlog-cli-contract.md, adr/0014, adr/0016. Found two more instances of the same "orphans/unlink rely on backlog search/labels query" drift in backlog-cli-contract.md (§1.1 table row + §2.3 bullet) — correct both. Record per-file conclusion in task notes.
4. No src/ changes (AC#4 no behavior change). Drive all docs/ edits through the lore CLI per the lore skill (lore instructions) so managed blocks/links stay coherent — ADR files are plain prose edits (no managed blocks), so this is a direct edit + `lore check`/`lore sync` verification pass, not a `lore` mutation command.
5. Verify: bun test (expect 2176/0 baseline), bun run lore check (expect 40 files/0 errors/0 warnings), bun run lint, bun run typecheck. Confirm git diff has zero src/ changes.
6. Decide CHANGELOG.md entry: likely no entry warranted (internal ADR/doc accuracy fix, no CLI-surface change) — state reasoning explicitly in the return.
7. Commit in small logical commits (Conventional Commits, Refs: LORE-265 trailer), including backlog/tasks/ edits, then push feature/LORE-265.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#3 sweep — grepped docs/ for 'orphan' (case-insensitive, excluding generated docs/log.md) and checked every hit:
- docs/reference/cli-surface.md (orphans entry): confirmed-accurate — already states the full three-part rule (no concept lists it, no doc: label, no owned ancestor per LORE-261). No edit.
- docs/reference/cli-contract.md (orphans.report row, read-heavy commands list): confirmed-accurate — only describes output shape/capping, makes no claim about the data source or ownership rule. No edit.
- docs/reference/architecture.md (command list, link/unlink section, adapter-isolation section): confirmed-accurate — general architecture-level mentions with no false claims about search or an incomplete rule. No edit.
- docs/specs/lore-design.md (§2.3 adapter capabilities, §10 build-order table): confirmed-accurate — §2.3 describes the adapter's overall JSON-only capability (it does have task-list/task-view/search code paths) without attributing search specifically to orphans; build-order table is just a milestone list. No edit.
- docs/reference/backlog-json-schema.md (labels[] callout): confirmed-accurate — correctly states lore orphans/link read the doc: label from labels[] in the task-list snapshot; matches orphans.ts's hasDocLabel. No edit.
- docs/adr/0014-core-has-no-llm-dependency.md (command list): confirmed-accurate — lists orphans among deterministic commands, no rule claim. No edit.
- docs/adr/0016-confluence-one-way-publish-deferred.md: 'orphaned pages' here refers to Confluence pages, unrelated to `lore orphans`. Not applicable, no edit.
- docs/reference/backlog-cli-contract.md: FOUND the same drift in two more spots and corrected both:
  1. §1.1 table's 'Fuzzy / label search' row claimed 'Used by orphans / unlink to find tasks owning a doc' — false; grepped src/ and confirmed zero production callers of searchByLabel/searchTasks (only test/backlog-adapter.test.ts calls them directly). Corrected to state these are adapter capabilities no lore command currently invokes, and describe what orphans/unlink actually do instead.
  2. §2.3's back-reference bullet claimed 'this is what lore orphans / lore unlink rely on' for the filtered `task list --json --labels` query — same false claim, corrected the same way.
- docs/adr/0009-story-task-coupling-reconciliation.md §2 itself: also corrected the trailing 'Bulk unlink also keys off the label set' claim in the same bullet being fixed for AC#1/AC#2 — verified false: `runUnlink` (src/commands/link.ts) takes explicit taskIds args, never queries by label.

Verification: bun test 2176 pass / 0 fail (baseline match); bun run lore check 40 files, 0 errors, 0 warnings (baseline match); bun run lint clean (biome, 112 files); bun run typecheck clean (tsc --noEmit). `git diff --stat -- src/` is empty — zero src/ changes, confirming AC#4 no-behavior-change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ADR-0009 §2 rewritten to match src/commands/orphans.ts ground truth: dropped the stale 'backlog search --json' claim (orphans.ts calls only adapter.probe()+listTasks(); grep confirms zero production callers of searchByLabel/searchTasks anywhere in src/), and now describes the full current ownership rule — a task is owned (not orphaned) when it carries a doc: label, OR a concept's tasks: forward-references it, OR an ancestor in its Backlog parentTaskId chain satisfies either (LORE-261). Also corrected an adjacent false claim in the same bullet ('Bulk unlink also keys off the label set' — unlink takes explicit task ids, never queries by label).
AC#3 sweep: checked every 'orphan' mention across docs/ (cli-surface.md, cli-contract.md, architecture.md, lore-design.md, backlog-json-schema.md, adr/0014, adr/0016, backlog-cli-contract.md) per the full breakdown in Implementation Notes. Found and fixed the same drift twice more in docs/reference/backlog-cli-contract.md (§1.1 table row + §2.3 bullet, both falsely attributed label/search queries to orphans/unlink). All other files confirmed accurate, left untouched.
Verified: bun test 2176 pass/0 fail (dev baseline), bun run lore check 40 files/0 errors/0 warnings (dev baseline), bun run lint clean, bun run typecheck clean, git diff --stat -- src/ empty (AC#4: zero behavior change). No CHANGELOG entry — internal ADR/doc accuracy fix with no CLI-surface or behavior change.
<!-- SECTION:FINAL_SUMMARY:END -->
