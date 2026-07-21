---
id: LORE-143
title: >-
  Scope `git log` in GitAdapter.history to the docs root instead of the whole
  repo
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 GitAdapter.history (and the real adapter in src/adapters/git.ts) accept a pathspec/root so the underlying `git log` invocation is scoped to the docs root (e.g. `-- docs`) instead of the whole repository.
- [ ] #2 A test (fake or real adapter) confirms the git command/args passed for a `lore sync` history fetch include a pathspec restricting to DOCS_DIR, and that commits touching only files outside docs/ are excluded from what the adapter returns, not merely from generateLog's post-filtering.
<!-- AC:END -->
