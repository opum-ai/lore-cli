---
id: LCLI-55.7
title: >-
  consumer-scaffold.test.ts: "mkdocs/docusaurus" notes test never actually
  exercises docusaurus
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:10'
labels:
  - test
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
modified_files:
  - test/consumer-scaffold.test.ts
parent_task_id: LCLI-55
priority: low
type: chore
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The test named "mkdocs/docusaurus results carry an empty notes array" (test/consumer-scaffold.test.ts) only calls scaffold(["mkdocs"]); buildDocusaurusScaffold's absent-notes contract is never actually exercised anywhere in the file despite the test's name claiming to cover both targets. A future edit that accidentally adds a stray notes array to buildDocusaurusScaffold (e.g. copy-pasted from buildObsidianScaffold) would ship `lore scaffold docusaurus --json` carrying unwanted guidance text, and this specific test -- the only one whose name claims to guard exactly that regression -- keeps passing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The test also calls scaffold(["docusaurus"]) and asserts its result.notes is an empty array, actually covering both targets its name claims to cover
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add a second scaffold(['docusaurus']) call + assertion to the 'mkdocs/docusaurus results carry an empty notes array' test (test/consumer-scaffold.test.ts) so it actually exercises both targets its name claims to cover.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: full suite 1497 pass (was 1497 before too, net-zero new test count since this added an assertion to an existing test rather than a new test), typecheck and lint clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The 'mkdocs/docusaurus results carry an empty notes array' test now also calls scaffold(['docusaurus']) and asserts its notes array is empty, actually covering both targets its name claims to. Verified: typecheck, lint, and full test suite (1497 pass) all clean.
<!-- SECTION:FINAL_SUMMARY:END -->
