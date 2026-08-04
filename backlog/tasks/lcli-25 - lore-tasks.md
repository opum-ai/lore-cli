---
id: LCLI-25
title: lore tasks
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:09'
labels:
  - cmd
  - 'doc:stories/build-the-lore-cli-foundation'
milestone: m-3
dependencies:
  - LCLI-21
documentation:
  - docs/reference/cli-surface.md
  - docs/stories/build-the-lore-cli-foundation.md
priority: medium
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Print the live task rollup for a Story via the JSON adapter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Output supports --plain and --json
- [x] #2 Reflects current Backlog status
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/commands/tasks.ts (NEW): thin read-only command. Options {root,output,args,stdout,stderr,adapter} modeled on context.ts. Hand-roll arg parse (value-bearing --status; accept --status=S). Flow: loadBundle(join(root,DOCS_DIR),{warnings}) -> flush advisories to stderr -> resolve concept via graph.concepts.get(idFromPath(id)); miss -> conceptNotInBundle(id) (not_found=3). dedupeTaskIds(toRefList(concept.frontmatter.tasks)). Explicit adapter.probe() up front so capability failure fails fast (missing binary=3 / not-json-capable=6). resolveTaskDetails (reuse reconcile-shared.ts) -> map found tasks to {id,title,status} rows; dangling ids (viewTask null) -> omit + stderr advisory, exit 0. Async Promise<number>.
2. Renderer: kind 'tasks.rollup', data = ARRAY [{id,title,status}] per cli-surface contract; pretty=colorized table, plain=one row/line. --status <S> filters output rows (case-insensitive exact on configured status label).
3. src/cli.ts: import runTasks; case 'tasks' forwarding adapter:context.adapter; position after 'unlink' matching manifest (order-sensitive test).
4. src/core/manifest.ts: LORE_MANIFEST 'tasks' entry (same position), exitCodes: exitCodesFor(['bundle','backlog']) = [0,2,3,4,6]; drop 'tasks' from aspirational docstring.
5. src/core/agent-bridge.ts: add 'tasks' to LORE_COMMANDS, summary byte-identical to manifest.
6. test/help.test.ts: add golden tasks:[0,2,3,4,6]; lockstep+order tests pass once positions agree.
7. test/tasks.test.ts (NEW): JSON envelope kind/shape; --status filter; unknown concept->3; dangling id omitted+advisory exit0; probe failure->6; plain/pretty asserts; end-to-end run([...]) with injected fakeAdapter (resolves via viewTask).
8. Docs: promote tasks.rollup from 'deferred' row to real cli-contract.md 2.1 registry row; update core/instructions.ts 'lore tasks not shipped' -> shipped; CHANGELOG Unreleased->Added. lore check clean.
9. Verify: bun lint/typecheck/test green; drive lore tasks against real bundle (/verify); PR into dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped lore tasks <id> [--status <S>] on feat/lore-25-tasks.

Design (approved): thin src/commands/tasks.ts over loadBundle + the Backlog JSON adapter (viewTask per id, like reconcile-shared/sync/check). Envelope kind: tasks.rollup; data is OBJECT-wrapped { concept, status?, tasks:[{id,title,status}] } — NOT a bare array. Reversed the earlier 'bare array per doc' call after verifying every sibling list command (query.results/graph.export/context.export) wraps its array for additive-safety (cli-contract §7); updated cli-surface.md:281 to match.

Backlog probe runs UP FRONT (adapter.probe()) so a missing binary (3) / non-json binary (6) fails fast BEFORE per-task reads — that ordering is what lets a viewTask null AFTER a passing probe mean unambiguously 'dangling tasks: id' (dropped + stderr advisory, exit 0; orphans/LCLI-32 owns the real report) rather than 'Backlog down'. Per-task reads use allSettled with first-in-order rethrow (no unhandled sibling rejection) so a genuine read drift hard-fails like check/sync. Empty tasks: short-circuits WITHOUT probing (mirrors gatherReconciliation).

Exit codes DERIVED from seams (LCLI-38 discipline): exitCodesFor(['bundle','backlog']) = [0,2,3,4,6]; golden row added to test/help.test.ts. --status is value-bearing so hand-rolled parse (à la context.ts), not parseCommandArgs.

Shipping-a-command ripples: manifest LORE_MANIFEST entry + agent-bridge LORE_COMMANDS entry (byte-identical summary 'Show the live status rollup for a concept's linked tasks') both inserted after sync (dispatch order, order-sensitive lockstep); regenerated .claude/skills/lore/SKILL.md via lore agents --force; dropped the now-invalid 'not lore tasks' assertions in agents.test.ts and the 'tasks is aspirational/unshipped' claims in manifest.ts + agent-bridge.ts docstrings; updated instructions.ts linking topic to point at lore tasks.

Verify: bun lint/typecheck/test green (1380 pass incl. 22 new tasks tests); lore check clean (32 files 0/0). Drove real CLI: adr/0009 (0 real tasks — the [task-42,task-57] is a fenced example) → empty rollup exit 0 + clean JSON; temp Story linking a task vs real STOCK backlog → probe fail-fast exit 6; unknown concept → 3; missing id → 2.

Code review (workflow-backed, high; 4 finders + per-location verify): 9 findings triaged.

FIXED (5):
- status case mismatch: --status matches case-insensitively but data.status echoed the RAW input, disagreeing in case with the rows it selected. Now canonicalized to the matched rows' Backlog casing (raw filter only when nothing matched); test asserts every row.status === data.status.
- fakeAdapter probe guard regression: I'd changed probe from notImplemented(throws) to always-permissive, silently removing the guard that link/rename tests rely on (they must never probe). Restored default=throws; capable/failing behavior now opt-in via opts.probe ('ok' | Error). tasks.test.ts uses an okAdapter() helper.
- warnDangling hand-rolled the 'warning:' prefix + painted the whole line; routed through the shared WarningCollector so it matches every other lore advisory's format/color.
- instructions.ts LINKING topic used <id> for both 'lore tasks <id>' (concept) and 'backlog task view <id>' (task); disambiguated to <conceptId>/<taskId>.
- cli-surface.md Exit row mis-attributed 3 solely to 'concept not found' and omitted usage-2; now: 2 usage · 3 concept-not-found-or-backlog-missing · 6 not-json-capable (house style).

DECLINED (4, with rationale):
- '-' accepted as --status value: '-' is a status string that matches nothing, identical to --status <anything-nonmatching>; rejecting only '-' would be arbitrary AND diverge tasks' value-flag reader from the 4 shared siblings (context/graph/query/schema) that all accept bare '-'.
- dangling advisory fires regardless of --status: intentional — it's a coupling-integrity signal on stderr (out of band from the filtered stdout); a status filter scopes the display, not the coupling check. Hiding a broken link under a filter would suppress a real problem.
- empty tasks: short-circuits before probe: correct — an uncoupled concept's rollup is legitimately empty regardless of Backlog state; probing just to report '0 tasks' is gratuitous IO. Mirrors gatherReconciliation.
- readValue is a 5th verbatim copy (context/graph/query/schema/tasks): real DRY debt but a cross-cutting refactor of 5 shipped commands; out of scope for net-new LCLI-25 (batch-isolation lesson). Candidate follow-up task.

Re-verified after fixes: typecheck clean, full suite 1381 pass, lint 0, lore check 32/0/0, agent bridge up-to-date, real happy path exit 0.
<!-- SECTION:NOTES:END -->
