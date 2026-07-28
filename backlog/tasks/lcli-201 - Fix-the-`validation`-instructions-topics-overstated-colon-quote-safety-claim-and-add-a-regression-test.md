---
id: LCLI-201
title: >-
  Fix the `validation` instructions topic's overstated colon quote-safety claim
  and add a regression test
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - core-engine-b
  - codex-review-followup
  - docs
dependencies: []
priority: low
type: docs
ordinal: 303000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** the `lore instructions validation` guidance precisely describes the colon quote-safety rule, and a regression test pins it so it cannot silently drift again.

**Why:** the VALIDATION topic body (src/core/instructions.ts, VALIDATION const, live lines ~153-154) says "a colon-containing value all fail unconditionally". The actual check, quoteSafetyForValue in src/core/validate.ts:429, only flags a colon-followed-by-space (`value.includes(": ")`) — so URLs (`https://…`) and full ISO timestamps (`2024-01-01T00:00:00`) that contain colons are accepted. The guidance overstates the rule and could mislead an agent into thinking such values fail. The sibling linking/check topics already have dedicated content-assertion tests (test/instructions.test.ts:44-96) but the validation topic has none, so this drift passes the suite undetected — which is exactly the residual of finding [5] in this same cluster.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity, cluster core-engine-b; also subsumes the validation-topic residual of the doc-2 finding at test/instructions.test.ts:58.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The `validation` topic body in src/core/instructions.ts no longer claims a "colon-containing value" fails; it states the hazard is a colon-followed-by-space (matching validate.ts:429's `value.includes(": ")`), i.e. that URLs and ISO timestamps carrying colons without ': ' are accepted.
- [x] #2 A new test in test/instructions.test.ts asserts the validation topic body describes the colon hazard as colon-plus-space and does NOT contain a blanket "colon-containing … fail unconditionally" claim, analogous to the existing linking/check content-assertion tests at test/instructions.test.ts:44-96.
- [x] #3 `bun test test/instructions.test.ts` passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reword VALIDATION topic body in src/core/instructions.ts (~lines 151-155) to describe the quote-safety colon hazard accurately as colon-followed-by-space (matching quoteSafetyForValue's `value.includes(": ")` check in validate.ts:429), and state that colon-carrying values without a following space (URLs, ISO timestamps) are accepted, not flagged.
2. Add a new test in test/instructions.test.ts (in the 'core/instructions — topic registry' describe block, alongside the linking/check content-assertion tests at lines 37-89) asserting the validation topic body: (a) does NOT contain the old blanket 'colon-containing ... fail unconditionally' claim, and (b) DOES describe the hazard as colon-plus-space and mentions URLs/ISO timestamps as accepted.
3. Run bun test test/instructions.test.ts, full bun test, and bun run typecheck to verify.
4. Sanity-check the new assertion is a real regression guard by temporarily reverting the wording and confirming the test fails, then restoring the fix.
5. Finalize task: check ACs with evidence, append notes, final summary, set Done.
6. Commit (Conventional Commit, trailer 'Refs: LCLI-201') and push feature/LCLI-201.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reworded VALIDATION topic body in src/core/instructions.ts to describe the quote-safety colon hazard accurately as colon-followed-by-space (matching quoteSafetyForValue's value.includes(": ") check at validate.ts:429), and explicitly stated that colon-carrying values with no trailing space (URLs like https://..., ISO timestamps like 2024-01-01T00:00:00) are accepted. Removed the false 'colon-containing value all fail unconditionally' claim.

Added a new test in test/instructions.test.ts ('validation topic describes the quote-safety colon hazard as colon-plus-space, not a blanket colon ban'), modeled on the existing linking/check content-assertion tests (lines 37-89). It asserts the body no longer contains the blanket claim and does contain 'colon followed by a space', 'URL', 'ISO timestamp', and 'accepted'.

Verification:
- bun test test/instructions.test.ts: 17 pass, 0 fail (was 16 pass before the new test existed).
- Sanity-checked the new test is a real regression guard: temporarily reverted src/core/instructions.ts to the old blanket-claim wording and re-ran bun test test/instructions.test.ts -> the new test failed as expected (16 pass / 1 fail, failure on the 'not.toContain(colon-containing value all fail unconditionally)' assertion). Restored the fix afterward; suite back to 17 pass / 0 fail.
- Full bun test: 1914 pass, 0 fail, across 47 files.
- bun run typecheck: clean (tsc --noEmit, no output).
- git diff --stat confirms only src/core/instructions.ts, test/instructions.test.ts, and this task's own backlog/tasks/ file changed -- stayed within the pinned file set.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the overstated colon quote-safety claim in the VALIDATION instructions topic (src/core/instructions.ts): it now says the hazard is a colon followed by a space (matching quoteSafetyForValue's value.includes(": ") check at validate.ts:429), and explicitly notes that colon-carrying values without a trailing space -- URLs, ISO timestamps -- are accepted, not flagged. Added a regression test in test/instructions.test.ts asserting the body no longer contains the old blanket 'colon-containing value all fail unconditionally' claim and does describe the colon-plus-space hazard plus the URL/ISO-timestamp exception. Verified via bun test test/instructions.test.ts (17 pass/0 fail), a revert-and-confirm-fail sanity check proving the new assertion is a real regression guard, full bun test (1914 pass/0 fail across 47 files), and bun run typecheck (clean). Changes stayed within src/core/instructions.ts and test/instructions.test.ts plus this task's own backlog file.
<!-- SECTION:FINAL_SUMMARY:END -->
