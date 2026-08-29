---
id: LCLI-362
title: >-
  A project-level .claude/skills/backlog-handover shadows the user-level skill
  and has drifted from it
status: To Do
assignee: []
created_date: '2026-08-28 23:59'
labels:
  - agents
  - skills
  - drift
dependencies: []
ordinal: 489000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`.claude/skills/backlog-handover/SKILL.md` (4293 bytes, last modified 2026-08-16) exists in this repository and differs from the user-level package at `~/.claude/skills/backlog-handover/SKILL.md`. The user-level skill's own startup procedure requires confirming it is the selected package and reporting a project-level shadow.

The 2026-08-28 invocation resolved to the user-level package (its reported base directory confirmed it), so that run was unaffected — but a shadow that differs is a silent fork: a future session could load the stale copy and follow a procedure the user has since changed, with nothing announcing the substitution.

Two related observations, both worth resolving in the same pass rather than separately: `.claude/skills/` also carries `handover` and `lore` directories, and this repository's AGENTS.md points agents at `.codex/skills/lore/SKILL.md` while CLAUDE.md points at `.claude/skills/lore/SKILL.md` — so the two agent-facing entry documents cite different skill roots for the same skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The project-level backlog-handover copy is removed, or deliberately retained with its divergence from the user-level package stated and justified in the repository's agent instructions
- [ ] #2 The .claude/skills and .codex/skills lore entries are reconciled so AGENTS.md and CLAUDE.md cite a skill root that exists and is the same one
- [ ] #3 Any retained project-level skill records why it must differ from its user-level counterpart
<!-- AC:END -->
