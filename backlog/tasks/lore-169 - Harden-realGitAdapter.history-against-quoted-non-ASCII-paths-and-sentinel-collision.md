---
id: LORE-169
title: >-
  Harden realGitAdapter.history against quoted non-ASCII paths and sentinel
  collision
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - errors-output-git
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
realGitAdapter.history() (src/adapters/git.ts:37) spawns `git log --name-only --relative --pretty=format:...` without `-c core.quotePath=false`, so git's default C-style quoting mangles non-ASCII file paths in the `--name-only` output before parseHistory reads them. Separately, parseHistory (line 100) splits the whole stdout blob on the literal SENTINEL string (`\x01lore:log-entry\x01`, line 22) with no verification that a commit subject can never contain that exact byte sequence, so the split is not provably collision-proof even though the code comments assert it is. Both issues can silently corrupt or misattribute file lists in the generated docs/log.md for real-world repos.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A repo history containing a commit that touches a non-ASCII-named file (e.g. `café.md`) round-trips through realGitAdapter.history() with the file path returned unquoted/undecoded correctly, verified by a regression test in test/git-adapter.test.ts.
- [ ] #2 The git invocation in realGitAdapter.history() disables path quoting (e.g. via `-c core.quotePath=false`) so non-ASCII paths are never emitted in git's quoted-octal form.
- [ ] #3 parseHistory's block-splitting behavior is documented or guarded so a commit subject/body containing the literal SENTINEL byte sequence cannot silently corrupt block boundaries, with a test asserting the guard.
<!-- AC:END -->
