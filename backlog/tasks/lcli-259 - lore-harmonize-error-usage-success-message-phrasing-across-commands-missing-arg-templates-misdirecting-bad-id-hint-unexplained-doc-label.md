---
id: LCLI-259
title: >-
  lore: harmonize error/usage/success message phrasing across commands
  (missing-arg templates, misdirecting bad-id hint, unexplained '(doc)' label)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:31'
labels:
  - cli-ux
  - errors-output
dependencies: []
references:
  - src/commands/link.ts
  - src/commands/tasks.ts
priority: low
type: bug
ordinal: 361000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
One consistent voice for lore's usage/error/success messages across commands, and hints that point at the command that actually does the job.

## Observed (real run) — three inconsistencies in the same error/UX class
1. **Misdirecting hint.** A bad/unknown concept id on 'lore link' hints to run 'lore check' to list concept ids — but 'lore check' prints only a summary count (e.g. '5 files, 0 errors, 0 warnings'), NOT an id list. Listing ids is 'lore query' / 'lore graph's job. The hint should point there. (Locate the exact hint in link's concept-resolution error path.)
2. **Inconsistent missing-arg templates.** For the SAME 'missing concept id' error class, 'lore link' (no args) says "`lore link` needs a concept id" (names the command) at src/commands/link.ts:823, while 'lore tasks' (no args) says "missing concept <id>" (no command name, different placeholder style) at src/commands/tasks.ts:257. Two templates for one error class.
3. **Unexplained success label.** 'lore link'/'lore unlink' success output ('TASK-1: added (doc), back-ref added') leaves '(doc)' unexplained unless the reader already knows it refers to the 'doc:' back-ref label.

## Why it matters
These are the first messages a new user meets. A hint that points at the wrong command, two phrasings for one error, and an unexplained token each add friction and erode trust in the CLI's polish — cheap to fix, high signal pre-v1.

## Direction
Pick one usage-error template (command-named + placeholder + actionable hint) and apply it everywhere; repoint the id-listing hint to 'lore query'/'lore graph'; make the link/unlink success line self-explanatory (e.g. 'back-ref (doc: label) added') or drop the bare '(doc)'.

## Refs
src/commands/link.ts:823, src/commands/tasks.ts:257 (the two missing-arg templates); link.ts concept-resolution error path (the misdirecting hint); link.ts success renderable (the '(doc)' label).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 'missing required arg' usage errors across commands use a single consistent template (command name + placeholder + actionable hint); link and tasks no longer diverge.
- [x] #2 The bad/unknown-concept-id hint points at a command that actually lists ids (lore query or lore graph), not lore check; verified by triggering the error.
- [x] #3 The link/unlink success output no longer shows a bare, unexplained '(doc)' — the doc: back-ref is named clearly.
- [x] #4 Existing output/error tests updated to the harmonized phrasing; full suite green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC#1 (missing-arg template): the codebase already has one dominant template for a
   missing required positional — `` `lore <command>` needs a <thing> `` + an actionable
   hint (link.ts:823, new.ts, rename.ts, replace.ts, supersede.ts, schema.ts all match
   it). Grep confirms exactly two outliers: context.ts:141 and tasks.ts:257, both
   `"missing concept <id>"` (no command name, different placeholder style). Rewrite
   both to the dominant template: `` `lore context` needs a concept id `` /
   `` `lore tasks` needs a concept id ``, keeping each command's existing (already
   actionable) hint text unchanged. No change to args.ts's `usage()` signature — this
   is a call-site string fix only, per the task's own steer.
2. AC#2 (misdirecting hint): verified live — `lore check` prints only a summary count
   ("N files, 0 errors, 0 warnings"), never concept ids; `lore query` (no args) and
   `lore graph` (no args) both list every concept id in the bundle. The hint text
   "run `lore check` to list concept ids" lives in ONE shared place,
   `conceptNotInBundle()` in core/bundle.ts — used by link.ts (concept-resolution +
   comma-guard paths), tasks.ts, supersede.ts, core/query.ts's `subgraph` (so also
   `lore graph <id>`/`lore context <id>`), and core/rewrite.ts (so `lore rename`).
   Fixing it centrally repoints every one of those consumers at once. Repoint to
   "run `lore query` or `lore graph` to see known concept ids". A byte-identical
   duplicate of the same wrong hint also exists standalone in sync.ts's
   `scopeConcepts` not-found error (not routed through conceptNotInBundle) — fixing
   it too so the harmonization doesn't leave one stale copy of the exact same
   misdirection; same one-line hint swap, no behavior change.
3. AC#3 (bare "(doc)"): link/unlink's per-task success line is
   `${task}: ${status} (doc), back-ref ${backRef}` — "(doc)" is a terse qualifier on
   the FIRST status (the concept's own `tasks:` frontmatter outcome), distinct from
   the second, already-self-labeled "back-ref" (the Backlog doc: label/--doc side).
   Rename the qualifier to name the actual frontmatter key it reports on, and label
   both fields symmetrically: `${task}: tasks: ${status}, back-ref: ${backRef}` (e.g.
   "lore-1: tasks: added, back-ref: added"). Update renderTaskReport in link.ts.
4. AC#4: update the pinned-string tests (test/context.test.ts, test/link.test.ts) to
   the new phrasing, add regression tests for each of the three fixes (command name
   present in the missing-id usage error; not_found hint mentions lore
   query/graph and not lore check; new success-line format), and confirm at least one
   new test fails when the fix is reverted. Run bun test / typecheck / lint /
   `lore check` / the docker e2e harness (this task owns running it this wave).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete.

AC#1 (missing-arg template): grepped every usage()/args.ts call site across the 18
command files. Found the codebase already had ONE dominant template — `` `lore
<command>` needs a <thing> `` + an actionable hint — used by link.ts:823, new.ts,
rename.ts, replace.ts, supersede.ts, schema.ts. Exactly two outliers matched the
task's own citation: context.ts:141 and tasks.ts:257, both bare "missing concept
<id>". Rewrote both to the dominant template, keeping each command's existing
(already-actionable) hint text.

AC#2 (misdirecting hint): verified live against this repo's own docs/ bundle —
`lore check` prints only "N files, M errors, K warnings" (no ids at all); `lore
query` and `lore graph`, run with no args, both list every concept id. The
"run `lore check` to list concept ids" hint lives in ONE shared function,
`conceptNotInBundle()` (core/bundle.ts) — consumed by link.ts (concept-resolution +
comma-guard), tasks.ts, supersede.ts, core/query.ts's subgraph (so also `lore graph
<id>`/`lore context <id>`), and core/rewrite.ts (so `lore rename`). Repointed it
centrally to "run `lore query` or `lore graph` to see known concept ids", fixing
every one of those call sites in one place. Found and fixed a second, standalone,
byte-identical copy of the same wrong hint in sync.ts's scopeConcepts not-found path
(not routed through conceptNotInBundle) — same misdirection, same one-line fix, left
in scope so the harmonization doesn't leave a stale duplicate. Left core/bundle.ts's
separate tokenEstimate() not_found hint alone — it already said "run `lore query`
..." and needed no fix.

AC#3 (bare "(doc)"): link/unlink's per-task success line was
`${task}: ${status} (doc), back-ref ${backRef}` — "(doc)" was a terse qualifier on
the tasks:-frontmatter status, distinct from the already-self-labeled "back-ref".
Renamed it to name the actual frontmatter key and label both fields symmetrically:
`${task}: tasks: ${status}, back-ref: ${backRef}` (e.g. "lore-1: tasks: added,
back-ref: added").

No changes to args.ts's `usage()` signature or the per-file local `usage()`
duplicates (check.ts/context.ts/graph.ts/new.ts/query.ts/schema.ts/replace.ts/
validate.ts each define their own copy rather than importing args.ts's) — consolidating
those is a separate, wider refactor outside this task's scope; call-site string
changes only, per the task's own steer.

Tests: updated pinned-string tests (test/context.test.ts, test/link.test.ts x4,
test/tasks.test.ts) and added new regression coverage (test/tasks.test.ts message
check, test/bundle.test.ts direct conceptNotInBundle unit test, test/sync.test.ts
hint check, test/link.test.ts hint check). Verified regression-worthiness by
`git stash push` on every src/ change and re-running the affected suites: all 4
new/strengthened assertions failed against the pre-fix code (confirmed exact old
strings in the failure output), then `git stash pop` restored the fix and the full
suite went green again.

Verification:
- `bun test` -> 2111 pass, 0 fail (5966 expect() calls)
- `bun run typecheck` -> clean (tsc --noEmit)
- `bun run lint` -> clean (biome check .)
- `bun run src/cli.ts check` -> "39 files, 0 errors, 0 warnings"
- docker e2e harness (PUID/PGID docker compose up --build --exit-code-from e2e) ->
  "==== E2E summary: 302 passed, 0 failed (report: /results/report.jsonl) ====",
  container exit 0 — matches the 302/0 baseline; no harness assertions needed
  updating since none pinned the exact strings this task changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Harmonized lore's usage/error/success phrasing across three related inconsistencies. (1) The two commands whose missing-required-id error diverged from the codebase's dominant `lore <command>` needs a <thing>` template (context.ts, tasks.ts) now match it exactly, same as link/rename/replace/supersede/schema. (2) The shared conceptNotInBundle() not_found hint (core/bundle.ts), used by link/tasks/supersede/graph/context/rename, and a standalone duplicate in sync.ts, no longer point at lore check (verified live: it prints only a summary count, no ids) -- both now point at lore query/lore graph (verified live: both list every concept id with no args). (3) link/unlink's per-task success line no longer shows a bare (doc) -- both halves are now explicitly labeled: 'tasks: <status>, back-ref: <status>'. Verified: bun test (2111 pass/0 fail), bun run typecheck (clean), bun run lint (clean), lore check on this repo's own docs/ (39 files, 0 errors, 0 warnings), and the docker e2e harness (302 passed, 0 failed, container exit 0 -- matches baseline). Confirmed 4 new/strengthened test assertions genuinely regression-test the fix by reverting the src changes and re-running: all 4 failed against the pre-fix strings, then passed again once restored.
<!-- SECTION:FINAL_SUMMARY:END -->
