---
id: LORE-130
title: >-
  writeAllOrRollback's --force overwrite is not crash-safe against a mid-write
  kill
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 20:21'
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
- [x] #1 The overwrite path used by writeAllOrRollback's --force branch no longer truncates the destination file in place; if the fix uses a temp-file-then-rename strategy, a process kill mid-write leaves either the original file intact or the fully-written new file, never a partially-overwritten file.
- [x] #2 If a full crash-safe fix is out of scope, the docstring/comment on writeAllOrRollback and writeFileNoFollow is updated to explicitly document the remaining crash-mid-write data-loss risk on the --force overwrite path, distinct from the symlink race that LORE-92 already closed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rework writeFileNoFollow (src/commands/fswrite.ts) to write new bytes to a fresh sibling temp file (open O_CREAT|O_EXCL, same short-write-safe writeAllBytes loop, close) then commit via a single renameSync onto the destination, instead of truncating the destination in place with O_TRUNC -- a kill mid-write now always leaves either the untouched original or the fully-written new file, never a partial overwrite.
2. Preserve the existing symlink refusal (LORE-92): lstat the destination up front and throw the same conflict/ELOOP-style LoreError if it is a symlink, before any temp-file I/O -- document why this doesn't reopen the TOCTOU window (renameSync structurally never follows a symlink at its destination, so even a race there can only affect refuse-vs-silently-replace, never write-through).
3. Preserve mode/ownership across the swap (mirroring writeFileAtomic's LORE-117 discipline) since the old in-place O_TRUNC write never re-created the inode and so never reset these -- a fresh temp file would otherwise silently apply the default umask.
4. Update the writeFileNoFollow and writeAllOrRollback docstrings to describe the new temp+rename mechanism and crash-safety guarantee (AC#2).
5. Add tests in test/fswrite.test.ts: (a) a simulated failure mid-temp-write (spyOn fs.writeFileSync/writeSync or fs internals) leaves the destination's ORIGINAL bytes fully intact, never truncated; (b) the write goes through a temp file + rename, not a direct write to the destination path; (c) mode is preserved across a force overwrite; (d) existing symlink-refusal and create-fresh-file behavior in test/replace.test.ts continue to pass unmodified.
6. Verify with bun test (full suite) and bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: writeFileNoFollow (src/commands/fswrite.ts) now writes the new bytes to a fresh sibling temp file (open O_CREAT|O_EXCL, same writeAllBytes short-write-safe loop, close) and commits with a single renameSync onto the destination, instead of truncating the destination in place with O_TRUNC. A kill/crash at any point before the commit rename now leaves the destination's complete ORIGINAL bytes untouched; a kill after the rename leaves the complete NEW bytes -- never a partial mix (AC#1). The pre-existing LORE-92 symlink refusal is preserved via an explicit lstatSync check on the destination before any temp-file I/O begins (throws the same conflict/'is a symlink' LoreError); documented why this doesn't reopen the TOCTOU window -- renameSync structurally never follows a symlink at its destination on POSIX, so even a race there can only change refuse-vs-silently-replace, never write-through. Mode/ownership are carried onto the temp file before the rename (mirroring writeFileAtomic's LORE-117 discipline) so the switch off same-inode-in-place-write doesn't regress permission preservation. Docstrings on both writeAllOrRollback and writeFileNoFollow updated to describe the new mechanism and guarantee (AC#2).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed writeFileNoFollow's --force overwrite (src/commands/fswrite.ts) to commit via write-to-temp-file + renameSync instead of in-place O_TRUNC, so a process kill mid-write now always leaves either the complete original file or the complete new file, never a partially-truncated one. Preserved the LORE-92 symlink refusal (explicit lstatSync check before any temp I/O) and added mode/ownership preservation on the temp file (mirroring writeFileAtomic's LORE-117 fix) to avoid regressing permission handling when switching off the same-inode in-place write. Updated docstrings on writeAllOrRollback and writeFileNoFollow to document the new crash-safety guarantee and why the symlink-race guarantee is preserved (actually strengthened, since renameSync never follows a symlink at its destination). Added test/fswrite.test.ts coverage: a failure injected at the writeSync call (standing in for a kill) leaves the destination's original bytes fully intact with no stray temp file; the commit path is proven to go through a .lore-nofollow-tmp-* temp file + rename (spying on renameSync), not a direct write to the destination; mode preservation across force-overwrite; fresh-file creation; directory-conflict handling. All pre-existing writeFileNoFollow symlink-refusal tests (test/replace.test.ts) pass unmodified. Verified: bun test -> 1800 pass / 0 fail across 47 files; bun run typecheck -> clean (tsc --noEmit, no errors). No docs/ files changed, so lore check was not required.
<!-- SECTION:FINAL_SUMMARY:END -->
