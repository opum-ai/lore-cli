---
id: LORE-130
title: >-
  writeAllOrRollback's --force overwrite is not crash-safe against a mid-write
  kill
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-meta-c
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`writeAllOrRollback` (src/commands/fswrite.ts:354-410) guarantees all-or-nothing writes only via an in-process try/catch with a LIFO undo stack triggered by a thrown JS exception; it provides no protection against the process being killed or crashing mid-write. Its `--force` overwrite path uses `writeFileNoFollow` (fswrite.ts:471-501), which closes the LORE-92 symlink TOCTOU race but still opens the destination with `O_TRUNC` and writes in place via a `writeSync` loop rather than write-to-temp-then-rename. A crash or kill signal during that write leaves the destination's existing bytes partially truncated/overwritten with no way to recover the original content, even though the function's docstring only documents the symlink race as closed and still says rollback is "best-effort" without calling out this separate crash-safety gap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The overwrite path used by writeAllOrRollback's --force branch no longer truncates the destination file in place; if the fix uses a temp-file-then-rename strategy, a process kill mid-write leaves either the original file intact or the fully-written new file, never a partially-overwritten file.
- [ ] #2 If a full crash-safe fix is out of scope, the docstring/comment on writeAllOrRollback and writeFileNoFollow is updated to explicitly document the remaining crash-mid-write data-loss risk on the --force overwrite path, distinct from the symlink race that LORE-92 already closed.
<!-- AC:END -->
