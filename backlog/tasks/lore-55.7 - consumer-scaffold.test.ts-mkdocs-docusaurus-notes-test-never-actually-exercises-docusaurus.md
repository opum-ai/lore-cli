---
id: LORE-55.7
title: >-
  consumer-scaffold.test.ts: "mkdocs/docusaurus" notes test never actually
  exercises docusaurus
status: To Do
assignee: []
created_date: '2026-07-18 22:54'
labels:
  - test
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - test/consumer-scaffold.test.ts
parent_task_id: LORE-55
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
- [ ] #1 The test also calls scaffold(["docusaurus"]) and asserts its result.notes is an empty array, actually covering both targets its name claims to cover
<!-- AC:END -->
