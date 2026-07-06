---
id: LORE-26
title: lore sync
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-07-06 22:37'
labels:
  - cmd
milestone: m-3
dependencies:
  - LORE-22
  - LORE-23
  - LORE-24
documentation:
  - docs/adr/0012-backlog-coexistence-git-ownership.md
priority: high
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recompute status, rewrite managed blocks, regen index/log; lore git-adds/commits backlog task files; single-writer; atomic per-file writes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Idempotent: a second sync makes no changes
- [x] #2 lore is the sole committer of backlog/
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. reconcile.ts: add optional `overrides` param to reconcileStatus(taskStatuses, statusFlow, overrides?).
   A status with a configured override bypasses position-based classify() entirely; its override
   target (validated as one of todo/in-progress/done) maps to the not-started/active/terminal
   position the existing aggregation already uses. Amend ADR-0009 §3.
2. adapters/backlog.ts: new export reading backlog/config.yml's `statuses:` directly via js-yaml
   (JSON_SCHEMA, matching concept.ts's pinned usage), default ["To Do","In Progress","Done"] per
   backlog-cli-contract §3.1 when absent/malformed-tolerant per contract. Pure parse fn + thin fs read.
3. src/state.ts (new): the .lore/ + git-ownership module (design §2.4). Injectable git-write seam
   (GitSpawn, mirrors adapters/backlog.ts's BacklogSpawn) with porcelainStatus/add/commit. Exposes
   commitBacklogIfDirty(root) used by sync only (NOT retrofitted into link/unlink/rename this task —
   follow-up task filed separately).
4. core/log.ts already defines the read-only GitAdapter; commands/sync.ts supplies the real
   implementation (shells `git log`) — a new small real-adapter constructor, likely alongside
   state.ts's git seam or its own tiny module.
5. commands/fswrite.ts: add writeFileAtomic (temp file in same dir + renameSync) for sync's writes only;
   existing commands keep writeFileOverwriting.
6. commands/sync.ts (new): loadBundle(docs/) -> for each Story/Spec with tasks:, resolve every linked
   task via BacklogAdapter.viewTask (a null on ANY linked id fails loud pre-write: not_found, exit 3,
   no partial writes — mirrors link.ts's validate-before-write) -> reconcileStatus (config-driven flow +
   overrides) -> regenerateTaskBlock -> generateIndexes + buildLog (skippable via --no-index) -> byte-diff
   against current disk contents, write only changed files atomically -> state.ts commits backlog/ last
   if dirty. --dry-run reports without writing. sync.result output. Exit 0 ok / 3 missing linked task /
   6 could not reconcile (Backlog probe failure etc).
7. Wire "sync" into src/cli.ts dispatch + USAGE text.
8. Tests: test/sync.test.ts (idempotency AC#1, missing-task exit 3, --dry-run, --no-index, sole-committer
   AC#2), test/state.test.ts (git seam, dirty/clean detection), reconcile.test.ts overrides cases,
   adapters/backlog status-flow parse tests.
9. Gates (bun test, biome check, tsc --noEmit) -> /code-review max -> fold -> CHANGELOG + backlog
   notes/ACs -> PR into dev.
10. File a follow-up Backlog task: retrofit link/unlink/rename to call state.ts's commit immediately
    after their own Backlog writes, per design §3.6 (deferred out of this task by user's explicit choice).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented lore sync (src/commands/sync.ts) end to end:

- reconcile.ts: reconcileStatus(taskStatuses, statusFlow, overrides?) — an override bypasses
  statusFlow position entirely, mapping directly to the not-started/active/terminal position the
  existing aggregation already uses; validated against todo/in-progress/done (config.ts's own
  header deliberately defers that vocabulary check here). ADR-0009 SS3 amended.
- adapters/backlog.ts: readStatusFlow(root)/parseStatusFlow(yamlText) read backlog/config.yml's
  statuses: directly via js-yaml (JSON_SCHEMA), default ["To Do","In Progress","Done"] per
  backlog-cli-contract SS3.1 when absent -- not a new backlog subprocess (precedent: lore check's
  future config-drift assertion, LORE-27, also reads this file directly).
- src/state.ts (new): the .lore/-and-git-ownership module design SS2.4 calls for -- scoped to the
  git-write half only (a 4th injectable seam, GitSpawn, mirroring BacklogSpawn). commitBacklogIfDirty
  scans `git status --porcelain --untracked-files=all -- backlog/`, C-unquotes any path git wrapped
  (any path with a space -- the normal case for Backlog task filenames -- or non-ASCII, reassembled
  as raw bytes and UTF-8-decoded once), stages exactly those paths, commits. Satisfies AC#2 by
  vacuuming up whatever's dirty under backlog/ regardless of source (link/unlink/rename don't call
  it themselves yet -- LORE-49 filed as an explicit follow-up, confirmed with the user rather than
  expanding this task onto already-merged LORE-24 code).
- src/adapters/git.ts (new): the real, git log-shelling GitAdapter (core/log.ts's own contract is
  SYNCHRONOUS -- Bun.spawnSync, not the async seam state.ts/adapters/backlog.ts use). Parsing uses a
  control-character sentinel line per commit (not blank-line counting) so a commit subject can never
  be misparsed as a boundary. resolveHeadSha returns null pre-first-commit (or non-git-repo) so sync
  emits an empty log.md rather than erroring.
- commands/fswrite.ts: writeFileAtomic (temp file same dir + renameSync) -- sync is the one command
  that can write many files per invocation, so a crash mid-run must never truncate any single file.
  Existing commands keep writeFileOverwriting; not retrofitted.
- commands/sync.ts: every linked task across every scoped concept resolved BEFORE any write (a
  missing id is not_found/exit 3, no partial state -- mirrors link.ts's precedent exactly); byte-diff
  against current disk content decides what actually gets written; --dry-run computes the full diff
  but skips both docs/ writes and the backlog/ commit; --no-index skips index.md+log.md (still
  whole-bundle regardless of [paths...] scoping, which only narrows reconciliation); a concept with
  tasks: but no managed-block markers fails loud (ADR-0008's own contract, not worked around).

Verified beyond the automated suite: a full manual smoke test against the real compiled CLI (bun
src/cli.ts) in a real git repo -- first sync regenerated index.md/log.md/sub-index from real history,
second run was a true 0-files-changed no-op, --dry-run reported without writing, --json emitted the
correct envelope.

13 new sync.test.ts cases (fakes + 2 real-git-integration + router), 11 state.test.ts, 8
git-adapter.test.ts, 9 backlog-status-flow.test.ts, 7 new reconcile.ts override cases. Full suite
1202/1202, typecheck clean, biome clean. CHANGELOG + ADR-0009 SS3 + cli-surface.md sync section
updated (the latter also fixed two pre-existing inaccuracies: managed-block reads viewTask per id,
not task list --json; index listing uses title not summary).

Filed LORE-49 (retrofit link/unlink/rename to call state.ts immediately) as the explicit,
user-confirmed follow-up -- not in this task's scope.
<!-- SECTION:NOTES:END -->
