---
id: LCLI-55.8
title: >-
  consumer-scaffold.test.ts: obsidian rendering test's ordering claim is not
  actually verified
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:23'
labels:
  - test
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - test/consumer-scaffold.test.ts
parent_task_id: LCLI-55
priority: low
type: chore
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The obsidian plain-mode rendering test's name ("lists the file, a summary, then the ... guidance notes") makes an ordering claim, but its body only uses expect(lines).toContain(...) -- unordered array membership -- so the claimed sequence is never actually verified. A future change to render() that prints the guidance notes before or interleaved with the file/summary lines would leave every assertion in this test passing unchanged, silently defeating the exact sequencing the test's own description says it checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The test asserts the actual line order (file line(s), then the summary line, then each guidance note line in order), not just unordered containment
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rewrite the obsidian plain-mode rendering test (test/consumer-scaffold.test.ts) to assert full-sequence equality (expect(stdout.lines()).toEqual([...])) against the exact expected order (file line, summary line, then each guidance note in order) instead of unordered toContain checks, so a future render() change that reorders/interleaves the notes fails the test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified against render()'s actual implementation (src/commands/scaffold.ts): file lines, then the summary line, then ...data.notes, confirming the expected order used in the rewritten assertion is correct by construction, not just guessed. Full suite: 1497 pass, typecheck clean, lint clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote the obsidian plain-mode rendering test to assert full ordered-sequence equality (file line, summary line, then each guidance note in order) instead of unordered containment, so it actually verifies the sequencing its own name claims to check. Verified: typecheck, lint, and full test suite (1497 pass) all clean.
<!-- SECTION:FINAL_SUMMARY:END -->
