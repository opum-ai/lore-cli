---
id: LCLI-328
title: >-
  backlog-handover can invoke self-committing Lore commands without commit
  authority
status: To Do
assignee: []
created_date: '2026-08-13 13:27'
labels:
  - agents
  - backlog
  - docs
  - git
  - lore
  - workflow
dependencies: []
references:
  - .codex/skills/backlog-handover/SKILL.md
  - .codex/skills/lore/SKILL.md
documentation:
  - docs/reference/cli-surface.md
  - docs/adr/0012-backlog-coexistence-git-ownership.md
priority: medium
type: bug
ordinal: 451000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The repository's backlog-handover workflow prohibits commits unless the user explicitly authorizes them, while documentation work must use Lore. Lore's documented coupling and reconciliation commands commit Backlog-owned task changes themselves: `lore link`/`unlink` commit the exact task files they edit, and `lore sync` can sweep remaining dirty `backlog/` state into a Lore-authored commit.

During the doc-18 restore on 2026-08-13, the agent followed the required Lore coupling workflow and ran `lore link stories/maintain-lore-cli-documentation-authority LCLI-325 --json`. The command correctly created commit `804534f13e7d83a6078fa4b6a6e8bf198080ddd3`, but the campaign had explicitly withheld commit authority. The agent only learned of the commit from the result envelope and had to stop for disposition.

The CLI behaved according to its current contract; the unsafe gap is in agent workflow guidance and preflight. A docs campaign with no commit authority needs an explicit warning and safe decision point before any Lore command that can create a commit. Preserve ADR-0012's sole-committer model unless a separate architectural decision deliberately changes it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `backlog-handover` explicitly identifies every Lore workflow command it may invoke that can create a git commit, including `link`, `unlink`, `rename`, and `sync`
- [ ] #2 Before invoking a self-committing Lore command, the workflow verifies explicit commit authority; when authority is absent it requests that exact permission or records a safe deferred stage
- [ ] #3 The Lore skill or generated agent guidance makes the self-committing behavior visible before its canonical link/sync steps, not only in deeper topic documentation or the result envelope
- [ ] #4 A regression scenario proves a documentation campaign with withheld commit authority does not create a commit before the user decision
- [ ] #5 The resulting guidance remains consistent with ADR-0012 and the CLI surface's documented sole-committer contract
<!-- AC:END -->
