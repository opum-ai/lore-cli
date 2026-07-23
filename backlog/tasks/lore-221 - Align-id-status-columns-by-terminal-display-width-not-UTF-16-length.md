---
id: LORE-221
title: 'Align id/status columns by terminal display width, not UTF-16 length'
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - errors-output-git
  - codex-review-followup
dependencies: []
priority: low
type: enhancement
ordinal: 323000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The shared id/status column alignment used by `lore tasks` and `lore orphans` pretty output should align correctly when a configured status string contains full-width (CJK) or zero-width/combining characters.

**Why:** `renderTaskSummaryRows` (src/output.ts:413-422) computes column widths with UTF-16 `.length` (`row.id.length`, `row.status.length` at lines 419-420) and pads with `String.prototype.padEnd` (line 421); both count UTF-16 code units, not terminal display columns. A CJK status (one code point, display width 2) under-pads and a combining sequence (two code units, display width 1) over-pads, so the id/status columns visibly misalign. The realistic vector is a wide/combining `status` string — the raw configured Backlog status (src/output.ts:376) — because the `id` column is always ASCII task ids and the `title` is the unpadded last column. This is pretty-mode-only; the --plain/--json machine contracts are unaffected. A repo-wide search confirms the codebase currently has no display-width/wcwidth/east-asian helper, so the fix is net-new but self-contained.

**Provenance:** doc-2 Codex second-opinion review, low-severity finding (cited output.ts:404), errors-output-git cluster. Re-verified still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Column-width measurement and padding in renderTaskSummaryRows account for terminal display width: full-width East Asian characters count as width 2 and zero-width/combining marks count as width 0.
- [ ] #2 Test: rows whose status contains a full-width (CJK) character align so the title column begins at the same offset across rows.
- [ ] #3 Test: rows whose status contains a combining mark align correctly.
- [ ] #4 ASCII-only rows render byte-identically to today (existing snapshot expectations in test/output.test.ts:517-522 and 528-563 still pass).
- [ ] #5 Implemented without adding an external runtime dependency (a compact self-contained width helper is acceptable).
<!-- AC:END -->
