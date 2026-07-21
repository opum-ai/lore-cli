---
id: LORE-170
title: resolveHeadSha can't tell an unborn branch from a corrupted-but-present .git
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
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveHeadSha (src/adapters/git.ts:70-85) decides between 'legitimately empty repo' and 'broken repo' purely by checking whether `git rev-parse --git-dir` succeeds after `git rev-parse HEAD` fails. A `.git` directory can be present and pass the `--git-dir` check while HEAD itself is corrupted (e.g. a malformed ref file), which this heuristic misclassifies as the benign unborn-branch case and returns `null` instead of throwing. The function's own doc comment (lines 58-65) promises it 'fails loud' for a genuinely broken repo, but the current check cannot distinguish the two failure modes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test simulating a corrupted HEAD (e.g. a `.git/HEAD` file containing garbage or pointing at a non-existent ref) inside an otherwise-valid `.git` directory causes resolveHeadSha to throw a `drift` LoreError, not return null.
- [ ] #2 A genuinely fresh/unborn-branch repo (real `.git`, zero commits, valid HEAD pointing at an unborn ref) still returns null from resolveHeadSha, unchanged from current behavior.
- [ ] #3 The distinguishing check no longer relies solely on `git rev-parse --git-dir` succeeding as proof of the benign case.
<!-- AC:END -->
