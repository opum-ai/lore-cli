---
id: LORE-26
title: lore sync
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-07-07 00:10'
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

1st /code-review max pass on PR #36 (19 agents: scope + 6 finders + verify pass +
sweep + synthesis, ~1.65M subagent tokens, ~50 min wall clock). 12 candidates
verified, 1 refuted, 11 confirmed -> 8 distinct defects after folding 2 duplicate
clusters (3-way arrow-parsing dup, 2-way commit-pathspec dup).

Most severe, both in the new git-write seam I wrote this session:
- state.ts:95 commitBacklogIfDirty's `git commit` had no pathspec -- committed
  the WHOLE index, not just backlog/, silently sweeping up any unrelated
  already-staged work. Fixed: `git commit -m <msg> -- <files>` (verified this
  git feature actually excludes other staged content, not just assumed it).
- state.ts:122 (reported 3x by different finders/verifiers, same root cause)
  porcelainPaths detected a rename by blindly searching porcelain lines for
  literal " -> ", which both mis-splits any filename containing that
  substring (a real risk -- Backlog task titles routinely have arrows) AND
  never matches how an UNSTAGED on-disk rename actually appears (git reports
  two independent entries, not one R line, until both sides are staged --
  verified empirically, this is not an edge case, it's the NORMAL case for
  a hand-renamed task file since nothing stages backlog/ changes ahead of
  commitBacklogIfDirty today). Root-caused and rewrote around
  `git status --porcelain=v1 -z`: NUL-delimited output has no " -> " text
  token at all (rename = two separate NUL fields) and disables C-quoting
  entirely, which ALSO retired the separate finding that unquoteGitPath's
  escape table was missing \a/\b/\f/\v -- that whole quoting-parsing
  mechanism is gone now, not patched.
- adapters/git.ts:31 realGitAdapter shelled `git log --name-only` without
  --relative, so a bundle nested below the git repo's own top level got
  every path reported relative to the repo top, not cwd -- core/log.ts's
  isUnderRoot would never match, silently producing an empty log.md forever
  with no error. Fixed with --relative (verified as a no-op when cwd IS the
  top level, so every existing test's assumption still holds).
- 3 cleanup findings: singleLineStderr triplicated (backlog.ts/state.ts/
  git.ts) -> consolidated into errors.ts's stderrHint; readIndexBytes
  byte-for-byte duplicated between rename.ts/sync.ts -> hoisted into
  discover.ts; sync.ts's and backlog.ts's absent-file handling each passed
  an unreachable notFound spec to the shared ioError -> replaced with a
  direct EACCES/EPERM check, no dead branch.

1 refuted: resolveAllTasks's per-id viewTask (vs a hypothetical bulk
listTasks call) is LORE-22's own documented, intentional architecture, not
a deviation this diff introduced -- verifier traced it to managed-block.ts's
pre-existing module doc.

Added real-git regression tests for every fix where the bug only reproduces
against real git (not a hand-fed fake): arrow-in-filename (both untracked-add
and as part of a staged rename/copy), unstaged on-disk rename committing both
sides, unrelated-already-staged-content surviving untouched, and a nested-
bundle log.md actually populating instead of silently staying empty. Full
suite 1209/1209 (48 new/updated this round), typecheck clean, biome clean.

2nd /code-review max pass on PR #36 (17 agents, ~1.15M subagent tokens, ~19 min).
9 candidates verified, 0 refuted, 5 distinct defects reported. Notably: round 1's
OWN fix for the pathspec-scoping bug introduced a new, more subtle bug -- a
lesson in how easy git commit-pathspec semantics are to get wrong twice.

- state.ts:99 (most severe) -- round 1's fix (`git commit -- <newpath>` for a
  staged rename) resurrects the OLD file into the commit's tree: `git commit --
  <pathspec>` fills in any path NOT in the pathspec from HEAD rather than
  treating it as absent, so omitting the old path doesn't mean "don't commit
  its deletion", it means "commit whatever HEAD already has for it" -- i.e.
  the old file reappears, and the staged deletion is left stranded, uncommitted.
  Verified directly (git ls-tree showed both old+new files after round 1's
  fix). Real fix: porcelainPaths now returns BOTH old+new paths for a staged
  R/C entry, and `git commit` gets both -- but `git add` must get ONLY the new
  path, since `git mv` already fully removes the old path from the index and
  re-adding it fails outright ("did not match any files"). Split into
  addPaths/allPaths accordingly. Verified via a real staged-rename integration
  test (git ls-tree confirms no resurrection, git status confirms no stranded
  deletion).
- sync.ts:217 -- index/log regeneration and the per-concept reconciliation
  loop both key writes by the SAME bundle-relative path space, so a concept
  that happens to be an index.md/log.md (a hand-added tasks: field on the
  root index, tolerated by schema validation as an unknown-key warning, not
  rejected) would have its reconciled status/managed-block write silently
  discarded by the index regeneration that runs after it. Fixed by excluding
  RESERVED_STEMS (index/log) from the reconciliation loop entirely, mirroring
  link/rename/supersede's existing assertNotReservedStem policy.
- adapters/git.ts:58 resolveHeadSha collapsed EVERY git rev-parse HEAD failure
  into null ("no history yet"), not just the legitimate empty-repo case -- a
  broken or missing git repository would silently produce an empty log.md and
  exit 0 instead of the fail-loud drift error its sibling history() path
  already produces for the identical condition. Fixed by disambiguating with
  `git rev-parse --git-dir` (succeeds in any real repo regardless of commit
  count; only a genuinely broken/missing repo fails that too) -- verified
  both branches against real git.
- sync.ts:148 resolveAllTasks (N Backlog subprocess calls) ran before
  readStatusFlow/loadConfig/loadProfile (fast, local, can throw validation
  errors), so a stale task id's not_found masked a more fundamental config
  problem and wasted N round-trips discovering it anyway. Reordered: config
  reads now run first.
- reconcile.ts:152 (cleanup/perf only, not fixed) -- reconcileStatus
  re-validates the same invariant overrides map on every per-concept call.
  Deliberately left as-is: negligible real cost (a tiny map, parsed at most a
  few dozen times per sync run) and consistent with the pre-existing,
  already-shipped statusFlow re-validation pattern from LORE-23 -- fixing it
  would mean expanding reconcileStatus's public contract for a gain that
  doesn't matter in practice.

New/updated regression tests: a real-git staged-rename integration test (the
actual bug reproduction), a reserved-stem-with-tasks: test, a not-a-git-repo
resolveHeadSha test, and a config-validated-before-subprocess-calls test.
Full suite 1213/1213, typecheck clean, biome clean. Starting a 3rd
/code-review max pass given round 2 found a bug IN round 1's own fix --
verifying convergence before asking for merge.
<!-- SECTION:NOTES:END -->
