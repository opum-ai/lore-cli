---
id: LORE-36
title: 'lore agents: SKILL.md + CLAUDE.md nudge'
status: To Do
assignee: []
created_date: '2026-06-21 06:27'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
  - agent-api
milestone: m-5
dependencies:
  - LORE-37
documentation:
  - docs/adr/0004-cli-first-skill-bridge-mcp-deferred.md
  - docs/runbooks/agent-onboarding.md
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generate .claude/skills/lore/SKILL.md (when-to-use + canonical loop) and a tiny marker-delimited CLAUDE.md nudge; idempotent with --check for CI. AGENTS.md via @import shim deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Re-running makes no changes (idempotent)
- [ ] #2 SKILL.md stays small and points at lore instructions
<!-- AC:END -->
