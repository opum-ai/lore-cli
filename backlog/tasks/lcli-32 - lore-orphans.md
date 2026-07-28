---
id: LCLI-32
title: lore orphans
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - cmd
milestone: m-4
dependencies:
  - LCLI-16
  - LCLI-21
documentation:
  - docs/reference/cli-surface.md
priority: medium
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Report tasks with no owning doc, docs whose tasks vanished, dangling refs (target gone), and duplicate concepts (same title/type). Detection only, never auto-merge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Finds dangling refs and vanished-task stories
- [x] #2 Output supports --json
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scope (reconciled): the AUTHORITATIVE cli-surface §orphans narrows this to the bidirectional task-coupling report — data { orphanTasks[], danglingLinks[] }. The older description's other two categories are out: doc→doc dangling refs are already `lore check`'s job (internal-link/anchor pass), and duplicate-concept detection is deferred (not in the committed surface). AC#1 (dangling refs + vanished-task stories) and AC#2 (--json) both satisfied by the two-category report.

2. Architecture: a single `adapter.listTasks()` snapshot (contract §: 'task list --json = current-branch on-disk truth', includes ALL statuses incl. Done) + pure set-arithmetic against the loaded bundle graph. NO per-id viewTask N+1 (cleaner than `lore tasks`). Probe UP FRONT (fail-fast 3/6), then one listTasks() (throw = hard error, propagate). dangling detection is the REPORT itself (not a soft advisory) — exit 0 always (report, not a gate).
   - orphanTasks = snapshot tasks whose id (case-insensitive) is NOT in any concept's tasks: forward-set AND that carry no `doc:` label. Row {id,title,status}, sorted by id.
   - danglingLinks = each concept tasks: id (case-insensitive) NOT in the snapshot's known-id set. Row {concept, task} (task echoed verbatim from frontmatter), sorted by (concept,task).
   - Boundary: any `doc:` label (even to a since-removed concept) exempts a task from orphanTasks — literal surface definition; a doc:->dead-concept is a 3rd category, out of scope.

3. Flags --tasks-only / --docs-only (mutually exclusive; both = usage 2). Compute both sides always; OMIT the excluded section's key from the envelope (mirrors tasks.rollup omitting `status`) so --docs-only --json never shows a misleading orphanTasks:[].

4. New src/commands/orphans.ts (runOrphans) — reuse loadBundle+toRefList, dedupeTaskIds+defaultAdapter (from link.ts), usage (args.ts), emit/Renderable, WarningCollector for load advisories. kind: 'orphans.report'.

5. Surface-coherence RIPPLE (all-or-CI-fails): cli.ts import+dispatch case AFTER tasks/before schema; manifest.ts LORE_MANIFEST entry (seams bundle+backlog => exitCodesFor, kind orphans.report) + fix docstring L44 aspirational list (drop orphans, keep scaffold); agent-bridge LORE_COMMANDS byte-identical summary; help.test golden row orphans:[0,2,3,4,6]; test/agents.test.ts:87 phantom list drop orphans; regen SKILL.md via `bun src/cli.ts agents --force`; promote orphans.report from the DEFERRED row in cli-contract §2.1; verify cli-surface §orphans has no deferred marker.

6. test/orphans.test.ts (extend fakeAdapter.listTasks first). Gates: bun test / biome check / tsc. Then /code-review high -> fold -> CHANGELOG Unreleased/Added -> notes/ACs -> PR into dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/commands/orphans.ts (runOrphans + pure computeOrphans). Single listTasks() snapshot + set-arithmetic vs bundle graph; probe up front (3/6), report-not-gate (exit 0). Surface ripple done: cli.ts dispatch (after tasks), manifest entry + docstring aspirational-list fix, agent-bridge LORE_COMMANDS, help.test golden row orphans:[0,2,3,4,6], agents.test phantom-list drop, SKILL.md regen, cli-contract §2.1 kind promoted (scaffold.result stays deferred), CHANGELOG Added. fakeAdapter.listTasks implemented (honors status/labels; opt-in listTasksError). Gates: tsc 0, biome 0, 1408 tests pass (incl. 27 new). E2E smoke: help/flags/probe-fail(6) all correct. Next: /code-review high -> fold -> PR.

Code review (workflow /code-review high): 7 findings, 0 refuted. Disposition after re-review:
- F1 (archived tasks reported as dangling): NOT a code bug. Verified empirically — 'backlog task archive' drops a task from BOTH task list AND task view (reads as not-found), identical to deletion. lore CANNOT distinguish archived from deleted via the JSON-only adapter (ADR-0002); reading backlog/archive/tasks/ would break that contract. Behavior is consistent with lore tasks (viewTask null → soft dangling → 'orphans owns the dangling report'). Documented the boundary in the module docstring.
- F2 (all-clear line over-claims under --tasks-only/--docs-only): FIXED. allClearLine() now phrases cleanliness only for requested sections; +2 tests.
- F3 (Math.max(...huge) spread RangeError): FIXED. Spread-free maxLen() loop; noted tasks.ts has the same latent pattern (bounded input there) → folded into LCLI-51.
- F4 (fakeAdapter listTasks guard weakened): FIXED. Reverted to opt-in ('ok'|Error, default notImplemented) mirroring the probe opt, preserving link/rename/tasks' loud never-snapshot guard.
- F5/F6 (dup summary-row type + aligned renderer with shipped tasks.ts): DEFERRED to LCLI-51 (cross-cutting extraction from shipped code needs its own focused review — the readValue precedent).
- F7 (stray doubled JSDoc opener in helpers.ts): FIXED.
Gates after fixes: tsc 0, biome 0, 1410 tests pass (+2 phrasing tests).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped 'lore orphans' — the bidirectional doc↔task coupling report. A single 'backlog task list --json' snapshot + pure set-arithmetic against the loaded bundle graph derives both directions: orphanTasks (a task no concept lists in tasks: and that carries no doc: label) and danglingLinks (a concept tasks: id the current-branch snapshot no longer knows). --tasks-only/--docs-only narrow the report by OMITTING the excluded envelope key (never an empty array). Backlog capability probed up front (missing→3, non-json→6); a report not a gate, so exit 0 on success even when non-empty. kind: orphans.report. Surface-coherence ripple applied (cli.ts, manifest+docstring, agent-bridge, help.test golden, agents.test phantom-list, SKILL.md regen, cli-contract §2.1 kind promotion, CHANGELOG). Verified: tsc 0, biome 0, 1410 tests pass (+31 new for orphans). Reviewed at /code-review high (7 findings, 0 refuted): F2/F3/F4/F7 fixed, F1 shown by-design (archived==deleted through the JSON-only adapter, consistent with lore tasks), F5/F6 render-dedup deferred to LCLI-51. Delivered as a PR into dev.
<!-- SECTION:FINAL_SUMMARY:END -->
