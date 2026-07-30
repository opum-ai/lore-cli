---
id: LCLI-285
title: Delegate terminal display-width calculation to string-width
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 17:05'
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
modified_files:
  - package.json
  - bun.lock
  - src/output.ts
  - test/output.test.ts
  - docs/reference/dependency-boundary-audit.md
  - docs/reference/tech-stack.md
  - docs/reference/architecture.md
  - docs/log.md
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
- [x] #1 Pretty output aligns columns for ordinary emoji, emoji variation sequences, regional-indicator flags, and zero-width-joiner grapheme sequences using terminal display width
- [x] #2 Existing ASCII, CJK wide-character, combining-mark, and ANSI-free output fixtures remain byte-compatible except where an incorrect width expectation is intentionally corrected
- [x] #3 The selected string-width release is exact-pinned and passes the pinned Bun runtime, typecheck, unit suite, and bun build --compile smoke test on supported packaging paths
- [x] #4 JSON and plain output contracts, semantic exits, stdout/stderr separation, color policy, and deterministic ordering are unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve a pinned-Bun 1.2.23 before-change oracle in test/output.test.ts: record displayWidth and exact renderTaskSummaryRows bytes for ASCII, East Asian wide/fullwidth, combining marks, ordinary emoji, emoji variation sequences, regional-indicator flags, short and multi-person ZWJ sequences, keycaps, and ANSI/control-sanitized fields. Baseline: output suite 80 passed; host compile/version passed at 61,335,888 bytes. The current helper reports 😀=1, ❤️=1, 🇺🇸=2, 👩‍💻=2, 👨‍👩‍👧‍👦=4, and 1️⃣=1; the intended package widths are 2 for every listed emoji grapheme. 2. Exact-pin string-width@8.2.2. Registry/upstream research on 2026-07-30: current 2026-07-08 MIT release, active maintenance, ESM with built-in types, Node >=20 engine declaration, 11,733 unpacked bytes, integrity sha512-GaPUh5gfdrYzqeVNZvUfT23vYYxXzKYidUcnMtJg/3rxRV63EFZy3k6xfKlmfeJD0176lnUV/Usr3XcwSvFzpg==, and broad adoption. Runtime graph: get-east-asian-width@^1.5.0 (MIT, Node >=18, zero deps) plus strip-ansi@^7.1.2 (MIT, Node >=12) and its ansi-regex@^6.0.1 (MIT, Node >=12, zero deps). All four upstream published-advisory queries returned empty. Bun 1.2.23 directly supports Intl.Segmenter, Unicode-set v regexes, RGI_Emoji, and Default_Ignorable_Code_Point required by 8.2.2; verify installed versions/integrities and bun audit. 3. Replace output.ts hand-maintained wide and zero-width range tables plus the code-point accumulator with a narrow displayWidth wrapper over string-width. Keep Lore-owned stripAnsiAndControls/singleLine sanitization before measurement/rendering, padEndDisplay, maxLen, row composition, output mode/color/stream policy, and all machine contracts unchanged. 4. Add versioned pre/post width and exact-row fixtures proving corrected emoji padding and unchanged ASCII/CJK/combining/ANSI-free bytes across the shared tasks/orphans renderer. Retain full JSON/plain/pretty, semantic exit, stdout/stderr, color, sanitization, and deterministic-order regressions. 5. Run focused conformance, bun audit, frozen-lock verification, full test/lint/typecheck/build/version gates, npm dry-run packaging, host before/after size measurement, and all five release-target compile/non-empty checks under Bun 1.2.23; then run Lore sync/strict validation/strict check and diff hygiene, record exact acceptance evidence, finalize, commit, and integrate only LCLI-285.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented commit 921032f on feature/lcli-285-string-width. Research reconciliation: string-width 8.2.2 is MIT, ESM with built-in types, Node >=20, released 2026-07-08, exact integrity sha512-GaPUh5gfdrYzqeVNZvUfT23vYYxXzKYidUcnMtJg/3rxRV63EFZy3k6xfKlmfeJD0176lnUV/Usr3XcwSvFzpg==. Bun 1.2.23 resolves get-east-asian-width 1.6.0 (MIT, Node >=18, zero deps, sha512-QRbvDIbx6YklUe6RxeTeleMR0yv3cYH6PsPZHcnVn7xv7zO1BHN8r0XETu8n6Ye3Q+ahtSarc3WgtNWmehIBfA==), strip-ansi 7.2.0 (MIT, Node >=12, sha512-yDPMNjp4WyfYBkHnjIRLfca1i6KMyGCtsVgoKe/z1+6vukgaENdgGBZt+ZmKPc4gavvEZ5OgHfHdrazhgNyG7w==), and ansi-regex 6.2.2 (MIT, Node >=12, zero deps, sha512-Bq3SmSpyFHaWjPk8If9yc6svM8c56dB5BAtW4Qbw5jHTwwXXcTLoRMkpDJp6VL0XzlWaCHTXrkFURMYmD0sLqg==). Upstream advisory queries were empty for all four packages; bun audit reported no vulnerabilities. Bun 1.2.23 directly verified Intl.Segmenter, Unicode v-set regex, RGI_Emoji, and Default_Ignorable_Code_Point support.

AC1 evidence: bun test test/output.test.ts passed 84 tests / 179 assertions. Versioned width and exact-row fixtures cover ordinary emoji, emoji variation, regional-indicator flags, short and multi-person ZWJ graphemes, and keycaps; all post widths are 2 and title-column prefix widths match. AC2 evidence: the same oracle pins unchanged empty/ASCII/CJK/fullwidth/combining widths, existing exact CJK/combining rows remain byte-identical, and the ANSI/control sanitizer row remains exact. Intentional corrections are isolated to 😀 1->2, ❤️ 1->2, family ZWJ 4->2, and keycap 1->2. AC3 evidence under pinned Bun 1.2.23 (cf136713): exact package pin and deterministic bun.lock; frozen install checked 50 installs across 58 packages with no changes; lint, typecheck, source version 0.0.0, build (222 modules), compiled version 0.0.0, and full 2,243-test suite passed. Five non-empty target binaries compiled: darwin-arm64 61,352,400; darwin-x64-baseline 67,433,136; linux-arm64 98,401,400; linux-x64-baseline 105,264,759; windows-x64-baseline 119,888,384 bytes. Host before/after: 61,335,888 -> 61,352,400 (+16,512). npm pack dry-run passed with 65 entries and bundled []. AC4 evidence: the complete 51-file suite passed 2,243 tests / 6,375 assertions, including JSON/plain/pretty modes, semantic exits, stdout/stderr separation, color, shared tasks/orphans rendering, sanitization, and deterministic-order regressions.

Documentation and repository gates: shipping architecture, dependency audit, and tech stack updated outside managed regions; lore sync updated docs/log.md; lore validate --strict passed 45 files with 0 errors/warnings and 5 skipped indexes; lore check --strict passed 45 files with 0 errors/warnings; git diff --check passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Exact-pinned string-width 8.2.2 and replaced Lore's incomplete Unicode range tables with a narrow displayWidth delegation while retaining field sanitization, padding, row composition, and every machine-output policy. Versioned pre/post and exact-row fixtures prove corrected emoji/variation/flag/ZWJ/keycap alignment and byte-compatible ASCII/CJK/combining/ANSI-free behavior. Verified under Bun 1.2.23 with 84 focused and 2,243 full tests, lint, typecheck, source/compiled version, host plus five-target compilation, clean audit/frozen install, npm dry-run packaging, strict Lore validation/check, and diff hygiene.
<!-- SECTION:FINAL_SUMMARY:END -->
