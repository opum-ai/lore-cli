---
id: LCLI-188
title: 'Quote the git-log docs-root pathspec with :(literal) in realGitAdapter.history'
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-engine-a
dependencies: []
priority: low
type: bug
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-10 integration finding (from LCLI-143). LCLI-143 scoped `git log` to the docs root by appending a trailing `-- <root>` pathspec in realGitAdapter.history (src/adapters/git.ts), with root defaulting to DOCS_DIR ("docs"). The pathspec value is passed raw rather than `:(literal)`-quoted (the convention state.ts adopted in LCLI-49). Today production only ever passes the constant "docs", so there is no live bug — but GenerateLogOptions.root and the history() seam are exported, and a profile-configurable docs root is a plausible future (ECK direction). A root containing pathspec-magic characters (`*`, `?`, `[`) or a leading `:` would be silently reinterpreted as pathspec magic and mis-scope log.md. Option injection is already blocked by the `--` separator; this is the remaining magic-in-pathspec gap. One-line fix plus one test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 realGitAdapter.history in src/adapters/git.ts passes the docs-root pathspec as `:(literal)<root>` (matching the LORE-49 :(literal) convention in state.ts), so a root containing pathspec-magic (`*`, `?`, `[`, or a leading `:`) is treated as a literal path, not magic.
- [x] #2 A test asserts the spawned `git log` args include the `:(literal)`-prefixed docs-root pathspec after `--`, and confirms `:(literal)` composes correctly with the existing `--relative` flag (docs-scoped commits still returned; out-of-docs commits still excluded).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/adapters/git.ts, add a local literalPathspec(path) helper mirroring state.ts's LCLI-49 :(literal) convention. 2. Apply it to the trailing pathspec in realGitAdapter.history's git-log args (after --), and to countCommits' git rev-list --count pathspec (kept identical to history()'s so the drift cross-check stays consistent for a magic-character root). 3. Update the existing LCLI-143 spawnSync-args test in test/git-adapter.test.ts to expect the :(literal)-quoted pathspec instead of the raw root. 4. Add a new LCLI-188 test asserting the spawned git log args contain the :(literal)-prefixed docs-root pathspec after --, composing correctly with --relative (docs-scoped commit still returned with correct relative file path; out-of-docs commit still excluded). 5. Verify with bun test (full suite) + bun run typecheck + biome check on touched files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: added literalPathspec() helper in src/adapters/git.ts, applied to both the git-log trailing pathspec in realGitAdapter.history and the git rev-list --count cross-check in countCommits (kept identical so the SENTINEL-collision drift check stays correct for a magic-character root). Updated the existing LCLI-143 spawnSync-args test to expect the :(literal)-quoted pathspec, and added a new test asserting the spawned git log args include the :(literal)-prefixed docs-root pathspec after --, composing correctly with --relative (docs-scoped commit still returned with the correct relative file path; out-of-docs commit still excluded).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed realGitAdapter.history in src/adapters/git.ts to pass the docs-root pathspec as :(literal)<root> (matching the LCLI-49 :(literal) convention in state.ts), closing the magic-in-pathspec gap for a future profile-configurable docs root. Also applied the same quoting to countCommits' git rev-list --count cross-check so it stays consistent with history()'s git log pathspec. Verified with the full bun test suite (1901 pass, 0 fail, including the updated + new git-adapter.test.ts cases) and bun run typecheck (tsc --noEmit, clean); biome check on the two touched files is clean (auto-fixed formatting/import-order, no residual errors).
<!-- SECTION:FINAL_SUMMARY:END -->
