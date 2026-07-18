---
id: LORE-55.11
title: >-
  scaffold.ts: module docstring's opening line still names only two of the three
  builders
status: To Do
assignee: []
created_date: '2026-07-18 22:55'
labels:
  - docs
  - cmd
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/commands/scaffold.ts
parent_task_id: LORE-55
priority: low
type: docs
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
commands/scaffold.ts's module docstring opening sentence still names only buildMkdocsScaffold/buildDocusaurusScaffold as the pure builders this file sits atop, even though this same diff wires in buildObsidianScaffold as a third and updates the docstring's closing paragraph to say all three are implemented. A reader skimming just the opening line undercounts how many consumer targets commands/scaffold.ts actually routes to, and the two paragraphs of the same comment block now disagree with each other.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module docstring's opening sentence names all three builders (buildMkdocsScaffold, buildDocusaurusScaffold, buildObsidianScaffold), consistent with its own closing paragraph
<!-- AC:END -->
