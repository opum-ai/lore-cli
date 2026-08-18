---
id: LCLI-341
title: Align FMC Worker identity and user-level skill authority
status: Done
assignee: []
created_date: '2026-08-18 16:04'
updated_date: '2026-08-18 16:04'
labels: []
dependencies: []
type: chore
ordinal: 464000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record lore-cli as the repository-local FMC Worker for Controller opum-doc, remove superseded local shadows of shared coordination skills, and audit retained Treehouse state without disturbing unique or unverifiable work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AGENTS.md records the lore-cli Worker identity, opum-doc Controller, repository-only ownership, addressed mailbox behavior, approval routing, and user-level shared skill authority.
- [x] #2 Project shadows for backlog-handover and treehouse-worktrees are removed while Lore continues to use the generalized user-level preflight gate.
- [x] #3 Treehouse, Git worktree, and filesystem state are audited; only proven-safe lore-cli-owned cleanup occurs, with retained exceptions recorded.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the user-level skill installation and inspect existing repository instructions and state. 2. Update AGENTS.md and remove only identified project-level shadows. 3. Re-audit Treehouse/Git/filesystem state and validate the resulting repository changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified all required user-level shared skills. Updated AGENTS.md with the FMC Worker contract and generalized user-level Lore preflight requirement; removed only the identified project-level backlog-handover and treehouse-worktrees shadows. Retained the unmerged /private/tmp/lore-cli-odoc-55-4-1-verify worktree and the legacy detached Treehouse path because disposal proof is absent.

Validation: node --check passed for the user-level generalized Lore preflight; git diff --check passed; exact project shadow inventory contains only .codex/skills/lore/SKILL.md; Treehouse status and prune report no current-pool candidates. Git still registers /private/tmp/lore-cli-odoc-55-4-1-verify at 27b0620 (unmerged campaign/odoc-55-4-1) and the detached legacy Treehouse path at 5cf9339; both are retained with no cleanup action.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Established the lore-cli FMC Worker contract for Controller opum-doc, removed the shared-skill shadows, and verified the generalized user-level Lore preflight syntax, clean diff, and Treehouse audit. Retained unrelated/unverifiable worktrees.
<!-- SECTION:FINAL_SUMMARY:END -->
