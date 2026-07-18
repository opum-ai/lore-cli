---
id: LORE-55.9
title: >-
  scaffold.ts: KNOWN_TARGETS/IMPLEMENTED_TARGETS are now identical sets, leaving
  a dead, untested branch
status: To Do
assignee: []
created_date: '2026-07-18 22:55'
labels:
  - cmd
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/commands/scaffold.ts
parent_task_id: LORE-55
priority: low
type: chore
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BUILDERS now maps mkdocs, docusaurus, AND obsidian, so IMPLEMENTED_TARGETS = new Set(Object.keys(BUILDERS)) is exactly {mkdocs, docusaurus, obsidian} -- identical to the hardcoded KNOWN_TARGETS. Any target string that passes KNOWN_TARGETS.has(target) therefore always passes IMPLEMENTED_TARGETS.has(target) too, so the "scaffold target ... is not implemented yet" branch can never execute for any input today. This diff also deletes the one test that proved that branch reachable ("a documented-but-unimplemented target (obsidian) is a usage error, not a crash") without adding a replacement, so a future contributor editing this validation logic gets zero test signal on that branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either collapse KNOWN_TARGETS/IMPLEMENTED_TARGETS to a single set (removing the now-dead not-implemented-yet branch) until a real documented-but-unbuilt target exists again, or add a synthetic/documented target that keeps the branch genuinely reachable and covered by a test
<!-- AC:END -->
