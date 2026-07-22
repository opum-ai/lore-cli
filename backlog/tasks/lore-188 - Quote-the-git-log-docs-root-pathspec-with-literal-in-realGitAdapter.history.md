---
id: LORE-188
title: 'Quote the git-log docs-root pathspec with :(literal) in realGitAdapter.history'
status: To Do
assignee: []
created_date: '2026-07-22 21:29'
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
Wave-10 integration finding (from LORE-143). LORE-143 scoped `git log` to the docs root by appending a trailing `-- <root>` pathspec in realGitAdapter.history (src/adapters/git.ts), with root defaulting to DOCS_DIR ("docs"). The pathspec value is passed raw rather than `:(literal)`-quoted (the convention state.ts adopted in LORE-49). Today production only ever passes the constant "docs", so there is no live bug — but GenerateLogOptions.root and the history() seam are exported, and a profile-configurable docs root is a plausible future (ECK direction). A root containing pathspec-magic characters (`*`, `?`, `[`) or a leading `:` would be silently reinterpreted as pathspec magic and mis-scope log.md. Option injection is already blocked by the `--` separator; this is the remaining magic-in-pathspec gap. One-line fix plus one test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 realGitAdapter.history in src/adapters/git.ts passes the docs-root pathspec as `:(literal)<root>` (matching the LORE-49 :(literal) convention in state.ts), so a root containing pathspec-magic (`*`, `?`, `[`, or a leading `:`) is treated as a literal path, not magic.
- [ ] #2 A test asserts the spawned `git log` args include the `:(literal)`-prefixed docs-root pathspec after `--`, and confirms `:(literal)` composes correctly with the existing `--relative` flag (docs-scoped commits still returned; out-of-docs commits still excluded).
<!-- AC:END -->
