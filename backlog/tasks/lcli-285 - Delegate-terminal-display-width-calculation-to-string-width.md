---
id: LCLI-285
title: Delegate terminal display-width calculation to string-width
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 16:59'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve a pinned-Bun 1.2.23 before-change oracle in test/output.test.ts: record displayWidth and exact renderTaskSummaryRows bytes for ASCII, East Asian wide/fullwidth, combining marks, ordinary emoji, emoji variation sequences, regional-indicator flags, short and multi-person ZWJ sequences, keycaps, and ANSI/control-sanitized fields. Baseline: output suite 80 passed; host compile/version passed at 61,335,888 bytes. The current helper reports 😀=1, ❤️=1, 🇺🇸=2, 👩‍💻=2, 👨‍👩‍👧‍👦=4, and 1️⃣=1; the intended package widths are 2 for every listed emoji grapheme. 2. Exact-pin string-width@8.2.2. Registry/upstream research on 2026-07-30: current 2026-07-08 MIT release, active maintenance, ESM with built-in types, Node >=20 engine declaration, 11,733 unpacked bytes, integrity sha512-GaPUh5gfdrYzqeVNZvUfT23vYYxXzKYidUcnMtJg/3rxRV63EFZy3k6xfKlmfeJD0176lnUV/Usr3XcwSvFzpg==, and broad adoption. Runtime graph: get-east-asian-width@^1.5.0 (MIT, Node >=18, zero deps) plus strip-ansi@^7.1.2 (MIT, Node >=12) and its ansi-regex@^6.0.1 (MIT, Node >=12, zero deps). All four upstream published-advisory queries returned empty. Bun 1.2.23 directly supports Intl.Segmenter, Unicode-set v regexes, RGI_Emoji, and Default_Ignorable_Code_Point required by 8.2.2; verify installed versions/integrities and bun audit. 3. Replace output.ts hand-maintained wide and zero-width range tables plus the code-point accumulator with a narrow displayWidth wrapper over string-width. Keep Lore-owned stripAnsiAndControls/singleLine sanitization before measurement/rendering, padEndDisplay, maxLen, row composition, output mode/color/stream policy, and all machine contracts unchanged. 4. Add versioned pre/post width and exact-row fixtures proving corrected emoji padding and unchanged ASCII/CJK/combining/ANSI-free bytes across the shared tasks/orphans renderer. Retain full JSON/plain/pretty, semantic exit, stdout/stderr, color, sanitization, and deterministic-order regressions. 5. Run focused conformance, bun audit, frozen-lock verification, full test/lint/typecheck/build/version gates, npm dry-run packaging, host before/after size measurement, and all five release-target compile/non-empty checks under Bun 1.2.23; then run Lore sync/strict validation/strict check and diff hygiene, record exact acceptance evidence, finalize, commit, and integrate only LCLI-285.
<!-- SECTION:PLAN:END -->
