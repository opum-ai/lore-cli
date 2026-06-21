---
id: LORE-4
title: Build the patched binary and wire lore capability probe
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:27'
labels:
  - backlog-fork
  - build
milestone: m-0
dependencies:
  - LORE-2
documentation:
  - docs/reference/backlog-cli-contract.md
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
bun build --compile the fork for local use as lore git dependency; verify backlog --version + dry task list --json shape probe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Local compiled binary runs task list --json successfully
- [ ] #2 Capability probe fails loud on a non --json-capable Backlog
<!-- AC:END -->
