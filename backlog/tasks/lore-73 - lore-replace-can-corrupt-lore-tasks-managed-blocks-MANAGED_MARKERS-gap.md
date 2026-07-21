---
id: LORE-73
title: 'lore replace can corrupt lore:tasks managed blocks (MANAGED_MARKERS gap)'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 13:14'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
core/replace.ts MANAGED_MARKERS only lists the lore:index begin/end markers. The lore:tasks managed-block markers that managed-block.ts (LORE-22) added after replace.ts shipped were never wired into this registry, so `lore replace` edits and counts matches inside a live task table, directly contradicting the documented "skips lore-managed regions" guarantee. Reproduced directly: replacing text inside a well-formed lore:tasks block edits the machine-owned row instead of skipping it. A subsequent `lore sync` will clobber the corrupted table. Found independently from two review angles (reading core/replace.ts directly, and reading commands/replace.ts which calls it) — same registry, same fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MANAGED_MARKERS in core/replace.ts includes the lore:tasks begin/end marker pair alongside lore:index
- [x] #2 lore replace leaves matches inside a lore:tasks managed block untouched and uncounted, matching its documented behavior for lore:index blocks
- [x] #3 A regression test covers a match located inside a lore:tasks block and asserts it is skipped
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: added TASK_BLOCK_BEGIN/TASK_BLOCK_END (managed-block.ts) as a second
MANAGED_MARKERS entry in core/replace.ts, alongside the existing
INDEX_BLOCK_BEGIN/END pair. locateManagedBlock (indexes.ts) is a plain
marker-string-agnostic indexOf scan — no lore:index-specific assumptions —
so it works unchanged for lore:tasks; this is the whole fix (module
docstrings updated to match, no longer forward-looking).

Verification:
- 5 new tests in test/replace.test.ts (2 in the AC#1 "managed regions are
  never touched" suite, 1 mixed index+tasks case, 2 in the managedRanges
  suite) proven as genuine regression guards via `git stash` isolated-revert:
  all 5 fail pre-fix (61 pass/5 fail), all pass post-fix (66 pass/0 fail).
- Live CLI repro in a scratch bundle (docs/stories/example.md with a real
  lore:tasks block linking LORE-99): pre-fix `lore replace foo BAR` reports
  count:4 and corrupts the task row ("foo widget"->"BAR widget", link path
  foo.md->BAR.md); post-fix reports count:2 (only the two prose
  occurrences) and the tasks block is byte-identical.
- Full suite: `bun test` 1613 pass / 0 fail. `bun run typecheck` clean.
  `bun run lint`: 4 pre-existing infos, all in files untouched by this
  change (managed-block.ts, managed-block.test.ts, supersede.test.ts).
<!-- SECTION:NOTES:END -->
