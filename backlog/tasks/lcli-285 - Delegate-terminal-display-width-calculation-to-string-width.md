---
id: LCLI-285
title: Delegate terminal display-width calculation to string-width
status: To Do
assignee: []
created_date: '2026-07-30 15:27'
labels:
  - dependencies
  - terminal-output
  - unicode
  - maintenance
dependencies: []
references:
  - src/output.ts
  - test/output.test.ts
documentation:
  - docs/reference/dependency-boundary-audit.md
priority: medium
type: bug
ordinal: 400000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the incomplete hand-maintained Unicode width tables introduced by LCLI-221 with an exact-pinned, maintained display-width primitive. The current helper handles its original CJK and combining-mark cases but mismeasures common emoji and joined grapheme sequences, which can still misalign pretty output. Preserve Lore machine output and existing ASCII rendering. This independent maintenance task does not gate or reorder M6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pretty output aligns columns for ordinary emoji, emoji variation sequences, regional-indicator flags, and zero-width-joiner grapheme sequences using terminal display width
- [ ] #2 Existing ASCII, CJK wide-character, combining-mark, and ANSI-free output fixtures remain byte-compatible except where an incorrect width expectation is intentionally corrected
- [ ] #3 The selected string-width release is exact-pinned and passes the pinned Bun runtime, typecheck, unit suite, and bun build --compile smoke test on supported packaging paths
- [ ] #4 JSON and plain output contracts, semantic exits, stdout/stderr separation, color policy, and deterministic ordering are unchanged
<!-- AC:END -->
