---
id: LORE-49
title: retrofit link/unlink/rename to commit backlog/ via state.ts
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-06 22:10'
updated_date: '2026-07-10 19:41'
labels:
  - cmd
dependencies:
  - LORE-26
priority: medium
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore-design.md §3.6 shows commands/link.ts and commands/rename.ts calling state.ts
to git add/commit backlog/ immediately after each Backlog write (task create/edit),
matching ADR-0012's "lore is the sole committer of backlog/" decision. LORE-24
(link/unlink/rename, merged via PR #35) predates state.ts and does not do this —
its Backlog writes (labels, --doc) currently sit uncommitted in the working tree
until something else commits them.

LORE-26 (lore sync) introduces state.ts and satisfies its own AC#2 by having
`lore sync` vacuum up and commit any uncommitted backlog/ changes when it runs,
regardless of source — by explicit user choice, deferring a retrofit of
link/unlink/rename to this follow-up task rather than expanding LORE-26's scope
onto already-shipped, merged code.

This task: change commands/link.ts (runLink/runUnlink) and commands/rename.ts's
moveBackRefs call site to invoke state.ts's commitBacklogIfDirty (or an equivalent
per-write commit) immediately after each Backlog write, per the design doc's
literal sequence flow — so backlog/ is never left uncommitted between a link/unlink/
rename call and the next `lore sync`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 link/unlink commit their own backlog/ writes immediately, matching design §3.6
- [x] #2 rename's back-ref move commits its backlog/ writes immediately
- [x] #3 no regression to LORE-24's existing exit codes/behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Mechanism: reuse state.ts commitBacklogIfDirty (design §3.6 'state.ts: git add/commit backlog/'; task sanctions it). No new per-path commit variant — the sweep-all was already reviewed in LORE-26, and scoping to specific task files is impractical (lore knows task IDs, not Backlog's title-bearing file paths). Note the ADR-0012 point-1 'only specific files' tension in notes; sweep-all is the accepted precedent.

2. link.ts: add gitSpawn?: GitSpawn to LinkOptions (default bunGitSpawn(root), mirroring sync). In runLink/runUnlink, AFTER the back-ref edit loop, commit ONLY when >=1 edit was actually attempted (outcome added/removed/failed) — skip on --no-back-ref and on a pure already-linked/absent no-op. Commit-then-emit so the report carries the outcome; a git-commit failure propagates as drift(6), consistent with sync + ADR-0012 'surface loudly'.

3. rename.ts: add gitSpawn?: GitSpawn to RenameOptions; commit after moveBackRefs, reusing its existing guard (linkedTasks>0 && !dryRun) plus edit-attempted. Unlinked / --dry-run rename never touches git (unchanged; no adapter, no gitSpawn).

4. Reports: add backlogCommit: BacklogCommitResult to Link/Unlink/RenameReport + a render line ('committed backlog/: N files'), mirroring SyncReport (--json parity + observability). [confirm w/ user]

5. Messages: per-command chore(backlog) commit messages (attributable history, ADR-0012).

6. Tests: extract ok/cleanGitSpawn/dirtyGitSpawn from sync.test.ts -> helpers.ts (shared by sync/link/rename). Inject cleanGitSpawn default in link.test opts() and rename back-ref tests. New: dirty->commits (asserts status/add/commit args), --no-back-ref->no commit, already-linked no-op->no commit, partial-fail->commits successes + exit drift, rename dirty/--dry-run/unlinked.

7. Docs: cli-surface Output rows (link/unlink/rename) note the backlog/ commit; cli-contract field lists if present; CHANGELOG Unreleased->Changed.

8. Gates: bun test + biome check + tsc; then /code-review high, fold, PR into dev.

AC#3 invariants: exits 0/2/3/5/6 unchanged; commit failure reuses 6/drift (additive source, same code).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped: link/unlink/rename now commit their doc:<conceptId> back-reference edits under backlog/ immediately (per design §3.6, ADR-0012), instead of leaving them uncommitted until the next lore sync. Mechanism: a new SCOPED state.ts commitBacklogFiles stages ONLY the task files each command actually edited (collected from detail.file after a successful editTask), honoring ADR-0012 §1 ('stage only the specific task file(s)') — sync keeps commitBacklogIfDirty as the bundle-wide catch-all sweep. link/unlink/rename reports gain backlogCommit:{committed,files} + a 'committed backlog/: N files' text line. Commit fires only on a real write (skipped: --no-back-ref, idempotent no-op, unlinked/--dry-run rename, null/empty file path); a failed git commit surfaces as drift(6). AC#1/#2/#3 all satisfied. Two code-review rounds (high): round 1 caught the sweep-all ADR-0012 violation (fixed via scoping); round 2 caught an empty-pathspec edge (fixed via truthy guard). Verified end-to-end against REAL git (state.test.ts) — scoped commit isolates unrelated backlog/ files incl. spaces in filenames. Gates: 1425 tests, biome 0, tsc clean, lore check 0/0. Delivered as PR (feat/lore-49-commit-backlog-writes → dev).
<!-- SECTION:NOTES:END -->
