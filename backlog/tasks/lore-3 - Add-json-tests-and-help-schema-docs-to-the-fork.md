---
id: LORE-3
title: Add --json tests and help-schema docs to the fork
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:27'
labels:
  - backlog-fork
  - test
milestone: m-0
dependencies:
  - LORE-2
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add src/test/cli-json-output.test.ts mirroring cli-plain-output.test.ts including a non-TTY pipe case; update addHelpSchema and CLI-INSTRUCTIONS.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests assert JSON.parse round-trips and that --json beats auto-plain on a pipe
- [ ] #2 bun test and bun run lint pass
<!-- AC:END -->
