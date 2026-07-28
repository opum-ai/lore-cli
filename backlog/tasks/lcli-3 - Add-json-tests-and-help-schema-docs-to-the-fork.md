---
id: LCLI-3
title: Add --json tests and help-schema docs to the fork
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - backlog-fork
  - test
milestone: m-0
dependencies:
  - LCLI-2
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add src/test/cli-json-output.test.ts mirroring cli-plain-output.test.ts including a non-TTY pipe case; update addHelpSchema and CLI-INSTRUCTIONS.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tests assert JSON.parse round-trips and that --json beats auto-plain on a pipe
- [x] #2 bun test and bun run lint pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered together with LCLI-2 in the same fork commit 28e0755 (branch tasks/back-510-json-output). src/test/cli-json-output.test.ts (7 tests) asserts JSON.parse round-trips the {schemaVersion,kind,data} envelope and includes the mandatory non-TTY pipe case proving --json beats shouldAutoPlain (AC#1). addHelpSchema (task list/view/search) + CLI-INSTRUCTIONS.md updated. Green gate (AC#2): bun test 1341 pass / 1 pre-existing unrelated fail (cli-doc-search error-message drift, fails on baseline), biome check clean, bunx tsc 0 errors. Note: fork's lint = biome (bun run check), not a 'bun run lint' script.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tests + help-schema + CLI-INSTRUCTIONS for --json were delivered as part of LCLI-2 (fork commit 28e0755). Both ACs met; green (tsc/biome/test).
<!-- SECTION:FINAL_SUMMARY:END -->
