---
id: LCLI-348
title: 'Fix agent manifest default kind: declare agent.profiles for agent list'
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-26 00:37'
updated_date: '2026-08-26 00:37'
labels: []
dependencies: []
type: bug
ordinal: 470000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 manifest kind for the agent command is agent.profiles, matching the list action emission and docs/reference/cli-surface.md; golden test updated; live-vs-manifest cross-check passes for agent actions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Change src/core/manifest.ts agent command kind from agent.context.export to agent.profiles (public contract per docs/reference/cli-surface.md §agent list), keeping resultKinds unchanged. 2. Update golden map in test/help.test.ts. 3. Add regression assertion that lore agent list --json emits exactly the manifest-declared kind. 4. Run focused tests + lint/typecheck.
<!-- SECTION:PLAN:END -->
