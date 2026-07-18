---
id: LORE-55.2
title: >-
  obsidian scaffold: published CLI docs (cli-surface.md / cli-contract.md) still
  say it is pending
status: To Do
assignee: []
created_date: '2026-07-18 22:54'
labels:
  - docs
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
documentation:
  - docs/reference/cli-surface.md
  - docs/reference/cli-contract.md
parent_task_id: LORE-55
priority: medium
type: docs
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
commands/scaffold.ts's own module docstring now declares obsidian fully implemented (LORE-41 shipped), but the canonical CLI reference docs it cites as authority still contradict this: docs/reference/cli-surface.md says "obsidian (pending, LORE-41)" and "a target with no builder yet (obsidian) is a usage error"; docs/reference/cli-contract.md's kind registry says "docusaurus/obsidian pending". A user or agent reading either doc before running `lore scaffold obsidian` is told to expect a usage error (exit 2), but the command now exits 0 and writes docs/.obsidian/app.json -- shipped code and shipped documentation disagree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 cli-surface.md's Consumer scaffolding section lists obsidian as implemented, not pending, matching mkdocs/docusaurus's phrasing
- [ ] #2 cli-contract.md's scaffold.result kind registry no longer lists obsidian as pending
- [ ] #3 Updated via the lore CLI (not hand-edited), and lore check / lore validate stay clean
<!-- AC:END -->
