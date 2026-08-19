---
id: LCLI-344
title: Add Hermes Agent integration support
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-18 20:30'
updated_date: '2026-08-19 03:27'
labels:
  - 'doc:stories/support-lore-agent-interoperability'
dependencies: []
references:
  - >-
    https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files/
  - 'https://hermes-agent.nousresearch.com/docs/user-guide/configuration'
  - 'https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/'
  - 'https://github.com/NousResearch/hermes-agent'
documentation:
  - docs/stories/support-lore-agent-interoperability.md
priority: medium
type: feature
ordinal: 467000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add implementation-neutral Hermes Agent support alongside Claude and Codex. Established facts (official docs): Hermes discovers project context with .hermes.md/HERMES.md first, then hierarchical AGENTS.md, with CLAUDE.md compatibility; keeps non-secret settings in ~/.hermes/config.yaml and secrets in ~/.hermes/.env; and uses SKILL.md skills. Recommendation for implementation research: evaluate a native .hermes.md/HERMES.md bridge versus reuse of hierarchical AGENTS.md; preserve Claude/Codex behavior and never write user-global Hermes config, secrets, or credentials.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Task distinguishes cited Hermes facts from implementation recommendations
- [ ] #2 Research evaluates native .hermes.md/HERMES.md versus hierarchical AGENTS.md without preselecting either
- [ ] #3 Integration preserves independent Claude and Codex behavior and writes no user-global Hermes config, secrets, or credentials
- [ ] #4 Tests cover detection, generated output, absence behavior, discovery precedence, and credential-safety boundaries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research cited Hermes discovery facts. 2. Compare native Hermes bridge with AGENTS reuse. 3. Implement selected safe project-local integration without credentials/global config. 4. Test detection, precedence, output, and absence.
<!-- SECTION:PLAN:END -->
