---
id: LORE-171
title: >-
  asText can return runtime undefined for Symbol/function input despite its
  string type
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-23 09:17'
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
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
asText (src/errors.ts:115) falls through to safeStringify(value) for any non-string, non-nullish input. safeStringify's fast path (lines 443-453) calls `JSON.stringify(value)`, but `JSON.stringify` returns `undefined` (not a thrown error) for a `Symbol` or a bare function value, so safeStringify's catch-based fallback never triggers and asText silently returns runtime `undefined` even though its signature promises `string`. Since asText exists specifically to guarantee cli-contract §5.2's message/hint fields are real strings, this gap defeats its own purpose for these input types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 asText(Symbol('x')) and asText(function(){}) each return an actual string (not runtime undefined) in a new test case in test/errors.test.ts.
- [x] #2 safeStringify is updated so that a JSON.stringify result of undefined for a non-nullish input value is treated as a stringify failure and routed through the existing fallback/degradation path instead of being returned as-is.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: safeStringify now treats a JSON.stringify undefined result (for a non-nullish value) as a stringify failure, routing through the existing toJsonSafe degrade path with a final [unserializable] backstop. Added asText describe block in test/errors.test.ts covering Symbol/function inputs.

Verification: bun test -> 1891 pass, 0 fail, 5332 expect() calls (47 files). bun run typecheck (tsc --noEmit) -> clean, no output. bun run lint (biome check) -> 3 pre-existing errors in src/core/managed-block.ts, test/context.test.ts, test/managed-block.test.ts, test/replace.test.ts, test/supersede.test.ts, test/validate.test.ts, all outside this task's scope and present on dev base ba2c12e before this change (confirmed via git diff --name-only showing only backlog task file + src/errors.ts + test/errors.test.ts modified); src/errors.ts and test/errors.test.ts are lint-clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
safeStringify (src/errors.ts) now treats a JSON.stringify(value) result of undefined for a non-nullish value as a stringify failure — routed through the existing toJsonSafe degrade path, with a JSON.stringify("[unserializable]") backstop when the degraded projection is also undefined (top-level Symbol/function). This closes the gap where asText(Symbol(...)) / asText(function(){}) returned runtime undefined despite the string-returning contract. Added an asText describe block in test/errors.test.ts covering Symbol and bare-function inputs (AC#1) plus regression coverage for ordinary strings/nullish/numbers/objects. Verified: bun test (1891 pass / 0 fail), bun run typecheck (clean), bun run lint (src/errors.ts + test/errors.test.ts clean; 3 pre-existing failures elsewhere in the repo, outside this task's file scope, unchanged by this diff).
<!-- SECTION:FINAL_SUMMARY:END -->
