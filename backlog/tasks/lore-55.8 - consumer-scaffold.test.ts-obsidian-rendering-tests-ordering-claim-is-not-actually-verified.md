---
id: LORE-55.8
title: >-
  consumer-scaffold.test.ts: obsidian rendering test's ordering claim is not
  actually verified
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
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The obsidian plain-mode rendering test's name ("lists the file, a summary, then the ... guidance notes") makes an ordering claim, but its body only uses expect(lines).toContain(...) -- unordered array membership -- so the claimed sequence is never actually verified. A future change to render() that prints the guidance notes before or interleaved with the file/summary lines would leave every assertion in this test passing unchanged, silently defeating the exact sequencing the test's own description says it checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The test asserts the actual line order (file line(s), then the summary line, then each guidance note line in order), not just unordered containment
<!-- AC:END -->
