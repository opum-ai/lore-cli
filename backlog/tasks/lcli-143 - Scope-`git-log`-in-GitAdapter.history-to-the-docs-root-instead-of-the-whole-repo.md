---
id: LCLI-143
title: >-
  Scope `git log` in GitAdapter.history to the docs root instead of the whole
  repo
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-engine-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitAdapter.history(range) (src/core/log.ts:69-71) takes only a `from`/`to` range with no root or pathspec parameter, so the real adapter (src/adapters/git.ts:37) shells `git log --name-only --relative <pretty-format> ...rangeArgs(range)` with no pathspec at all — it walks and buffers the entire repository's commit history on every `lore sync`, not just the history touching `docs/`. src/commands/sync.ts:226 calls `buildLog(..., { to: headSha }, { root: DOCS_DIR })`, but that `root` only narrows the result afterward inside the pure `generateLog`/`foldersTouched`/`isUnderRoot` filtering (log.ts:125-187); the expensive unscoped `git log` call and full-history buffering already happened by then. In a large or long-lived repository this means `lore sync` pays the cost of walking unrelated source history just to build a docs-scoped `log.md`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GitAdapter.history (and the real adapter in src/adapters/git.ts) accept a pathspec/root so the underlying `git log` invocation is scoped to the docs root (e.g. `-- docs`) instead of the whole repository.
- [x] #2 A test (fake or real adapter) confirms the git command/args passed for a `lore sync` history fetch include a pathspec restricting to DOCS_DIR, and that commits touching only files outside docs/ are excluded from what the adapter returns, not merely from generateLog's post-filtering.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add root as a (pathspec) parameter to GitAdapter.history (core/log.ts) -- optional so fakes stay one-liners -- and factor root normalization (trailing-slash strip + DOCS_DIR fallback) out of generateLog into a shared resolveRoot() helper used by both generateLog and the new buildLog forwarding.
2. buildLog now calls adapter.history(range, resolveRoot(options.root)) so the real adapter receives the same root that scopes the rendered log.md.
3. realGitAdapter (adapters/git.ts) appends `-- <root>` (default DOCS_DIR) to the git log invocation so the walk itself is pruned to the docs root, not just post-filtered by generateLog/foldersTouched/isUnderRoot.
4. sync.ts call-site needs no change: it already passes { root: DOCS_DIR } through to buildLog, which now forwards it into the adapter.
5. Tests: log.test.ts asserts buildLog forwards the resolved root into adapter.history (fakeAdapter records seenRoots); git-adapter.test.ts adds a real-git test asserting the spawned args include a `-- docs` pathspec (spyOn(Bun.spawnSync) delegating to the real impl) and a test proving a commit touching only out-of-docs files is absent from history()'s return value entirely (not just empty files) -- plus updates the existing nested-bundle regression test's stale assertion to match the new, stricter adapter-level pruning.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: core/log.ts GitAdapter.history now takes an optional root/pathspec (buildLog resolves options.root via a new shared resolveRoot() helper and forwards it into adapter.history, not only into generateLog's post-filtering). adapters/git.ts's realGitAdapter appends `-- <root>` (default DOCS_DIR="docs") to the git log invocation, scoping the walk itself. sync.ts needed no change -- it already threads { root: DOCS_DIR } through buildLog.

Verification:
- bun test test/log.test.ts -> 20 pass, 0 fail (new: buildLog forwards resolved root into adapter.history as pathspec, both default DOCS_DIR and a custom root).
- bun test test/git-adapter.test.ts -> 12 pass, 0 fail (new: spyOn(Bun.spawnSync) delegating to the real impl proves the spawned git log args contain a `-- docs` pathspec; new: a commit touching only an out-of-docs file is absent from history()'s returned array entirely, not just reported with empty files; updated the pre-existing nested-bundle regression test's stale assertion -- the out-of-project commit is now pruned by the pathspec rather than merely losing its file list).
- bun run typecheck -> clean.
- bun test (full suite) -> 1813 pass, 0 fail across 47 files.
- bun run lint -> no new diagnostics from the changed files; the one remaining biome error (test/context.test.ts formatting) is pre-existing on dev (commit 43cf732), untouched by this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
GitAdapter.history (core/log.ts) now accepts an optional root/pathspec, and buildLog forwards the resolved bundle root into it (a new shared resolveRoot() helper keeps generateLog's post-filtering and the adapter pathspec in agreement). The real adapter (adapters/git.ts) appends `-- <root>` (default DOCS_DIR) to its `git log` invocation, so the walk is scoped to docs/ at the git level instead of buffering the whole repo's history. sync.ts's call-site needed no change since it already passed { root: DOCS_DIR }.

Verified with: bun test test/log.test.ts (20 pass), bun test test/git-adapter.test.ts (12 pass, including a spyOn(Bun.spawnSync)-based test proving the spawned args carry a `-- docs` pathspec, and a test proving an out-of-docs commit is absent from history()'s result entirely -- not merely reported with empty files), bun run typecheck (clean), full bun test (1813 pass / 0 fail across 47 files). bun run lint shows no new diagnostics from the changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
