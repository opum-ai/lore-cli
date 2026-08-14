---
id: LCLI-328
title: >-
  backlog-handover can invoke self-committing Lore commands without commit
  authority
status: Done
assignee:
  - '@codex'
created_date: '2026-08-13 13:27'
updated_date: '2026-08-14 01:40'
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
- [x] #1 `backlog-handover` explicitly identifies every Lore workflow command it may invoke that can create a git commit, including `link`, `unlink`, `rename`, and `sync`
- [x] #2 Before invoking a self-committing Lore command, the workflow verifies explicit commit authority; when authority is absent it requests that exact permission or records a safe deferred stage
- [x] #3 The Lore skill or generated agent guidance makes the self-committing behavior visible before its canonical link/sync steps, not only in deeper topic documentation or the result envelope
- [x] #4 A regression scenario proves a documentation campaign with withheld commit authority does not create a commit before the user decision
- [x] #5 The resulting guidance remains consistent with ADR-0012 and the CLI surface's documented sole-committer contract
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory every Lore command the Codex handover loop may invoke that can commit and ground the behavior in ADR-0012, the Lore skill, and lifecycle tests.
2. Add an explicit preflight contract: standing campaign delivery authority satisfies commit authority only for selected in-scope work; otherwise self-committing commands must stop before execution or persist a deferred stage.
3. Make the Lore skill bridge expose the commit side effect before link, rename, or sync steps and add a regression scenario for withheld authority.
4. Run the focused handover lifecycle tests, Lore strict gates, and diff hygiene before settlement.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented an explicit commit-side-effect preflight in both Codex skills. The workflow enumerates link, unlink, rename, and sync; recognizes standing delivery authority only for the selected repository and in-scope work; otherwise stops before invocation for an exact permission request or durable deferred stage. Added a withheld-authority regression and an ordering assertion that the Lore warning appears before canonical steps. Verification: bun test test/backlog-handover-lifecycle.test.ts passed 9 tests; lore validate --strict and lore check --strict passed 70 files with zero findings; git diff --check passed. Biome/typecheck were unavailable because this isolated worktree has no installed dependencies and will be covered by the cumulative repository gate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the self-committing Lore authority gap without changing ADR-0012: campaign guidance now preflights every Lore command that can commit, refuses invocation when authority is withheld, and exposes the side effect before canonical Lore steps. Verified with nine focused lifecycle tests, strict Lore validation/check, and diff hygiene.
<!-- SECTION:FINAL_SUMMARY:END -->
