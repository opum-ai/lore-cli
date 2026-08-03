---
id: LCLI-49
title: retrofit link/unlink/rename to commit backlog/ via state.ts
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:09'
labels:
  - cmd
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies:
  - LCLI-26
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
priority: medium
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore-design.md §3.6 shows commands/link.ts and commands/rename.ts calling state.ts
to git add/commit backlog/ immediately after each Backlog write (task create/edit),
matching ADR-0012's "lore is the sole committer of backlog/" decision. LCLI-24
(link/unlink/rename, merged via PR #35) predates state.ts and does not do this —
its Backlog writes (labels, --doc) currently sit uncommitted in the working tree
until something else commits them.

LCLI-26 (lore sync) introduces state.ts and satisfies its own AC#2 by having
`lore sync` vacuum up and commit any uncommitted backlog/ changes when it runs,
regardless of source — by explicit user choice, deferring a retrofit of
link/unlink/rename to this follow-up task rather than expanding LCLI-26's scope
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
- [x] #3 no regression to LCLI-24's existing exit codes/behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Mechanism: reuse state.ts commitBacklogIfDirty (design §3.6 'state.ts: git add/commit backlog/'; task sanctions it). No new per-path commit variant — the sweep-all was already reviewed in LCLI-26, and scoping to specific task files is impractical (lore knows task IDs, not Backlog's title-bearing file paths). Note the ADR-0012 point-1 'only specific files' tension in notes; sweep-all is the accepted precedent.

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

Post-delivery /code-review (max, PR #44): 12 verified findings → 9 distinct. Fixed on-branch (all with regression tests):
- #1 commit-before-emit (link/unlink/rename): commitBacklogFiles now CAPTURES a drift git failure into BacklogCommitResult.error instead of throwing, so the command still emits its per-task report (naming every write) before exiting drift(6). Callers OR backlogCommit.error into the exit code.
- #2 rename late advisory flush: resolved by #1 — commit no longer throws between the write and emit/advisories.flush, so both always run on the write path.
- #3 same-file WIP sweep: docstring overpromise corrected — isolation is FILE-granular (git pathspec commit); an unrelated edit to the SAME file being committed is included by design. Documented, not code-changeable.
- #4 multi-file commit untested: added real-git multi-id test (both files committed, unrelated third untouched).
- #6 wildcard glob in pathspec: each status/add/commit pathspec is now :(literal)-quoted (state.ts literalPathspec) so a filename with [ * ? can't glob-match a sibling; verified against real git + regression test.
- #7 no backlog/ scope assert: commitBacklogFiles now throws if any path escapes backlog/ (defense-in-depth for the removed bundle-wide sweep's structural guarantee).
- #8 triplicated 'committed backlog/: N files' render: extracted shared state.ts renderBacklogCommitLine, now used by link/unlink/rename/sync (also renders the new 'backlog/ commit failed:' line).
- #9 redundant empty-files guard: removed from commitBacklogFiles; commitBacklogIfDirty's empty-pathspec guard is the single source of truth.
ACCEPTED-BY-DESIGN (no code change):
- #5 new hard git dependency (AC#3): link/unlink/rename now shell git for any real back-ref write, so a non-git repo (or one with no user.name/email) exits 6 where it previously exited 0. This is consistent with lore sync + ADR-0012 (lore is the sole committer of backlog/, which presupposes git). AC#3 ('no regression to existing exit codes/behavior') is read as 'the documented link/unlink/rename exit contract', which is unchanged; running outside a git repo was never a supported lore workflow.
Gates after fixes: 1433 tests (+8), biome 0, tsc clean, lore check 0/0.
<!-- SECTION:NOTES:END -->
