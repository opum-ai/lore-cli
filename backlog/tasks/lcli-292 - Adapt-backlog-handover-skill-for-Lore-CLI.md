---
id: LCLI-292
title: Adapt backlog-handover skill for Lore CLI
status: Done
assignee:
  - '@codex'
created_date: '2026-08-02 03:35'
updated_date: '2026-08-02 03:39'
labels: []
dependencies: []
modified_files:
  - .codex/skills/backlog-handover/SKILL.md
  - .codex/skills/backlog-handover/agents/openai.yaml
ordinal: 405000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adapt the Skadi Labs backlog-handover campaign skill into a repository-local Codex skill that uses this project's Backlog.md CLI workflow, preserves task and dependency state through the CLI, and produces grounded session handovers without relying on Claude-only primitives.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A repository-local Codex backlog-handover skill is discoverable under .codex/skills
- [x] #2 The workflow uses backlog instructions and Backlog CLI commands for all task, document, and campaign-state mutations
- [x] #3 Claude-only model names, primitives, statusline hooks, and direct Backlog markdown edits are removed or replaced with Codex-compatible behavior
- [x] #4 The skill defines safe init, restore, write, and status modes with grounded git and Backlog state
- [x] #5 Skill metadata and structure pass the skill validator
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Recreate the previously completed repository-local skill on a clean integration-based branch through the Backlog CLI.
2. Add explicit closure hygiene learned from the stale primary checkout: artifact disposition, integration-based reconciliation, blob classification, authority-boundary recording, and post-merge branch/worktree/lease audit.
3. Validate skill metadata and behavior, diff hygiene, and Backlog records.
4. Deliver through a reviewed pull request, then clean exact verified merged branches, worktrees, and leases.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Recreated the previously unintegrated repository-local backlog-handover skill on a clean branch from origin/dev de14ffe, preserving Backlog ownership through the CLI. Added explicit closure hygiene based on the repository audit: every repo-visible artifact must be delivered, local-only by design, or retained with owner/reason; stale primary paths require blob/content classification; coordinator state belongs on an integration-based reconciliation branch; post-merge audits must cover tracker/task delivery, local and remote refs, worktrees, and Treehouse leases; Treehouse return is distinct from physical prune; and final tracker settlement must itself be delivered.

Validation: official skill-creator quick_validate passed. Deterministic contract audit confirmed all four modes, mandatory Backlog overview, sequential-safe execution, authority boundaries, closure section, and absence of stale model/tool primitives. git diff --check passed. No application source or docs/ files changed, so application and Lore test suites were not required.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered the repository-local Backlog Handover skill with explicit end-of-wave closure hygiene, integration-based dirty-state reconciliation, blob-level stale-versus-unique classification, exact branch/worktree/lease cleanup gates, and follow-up tracker delivery requirements. Preserved the release-truth documentation follow-up as LCLI-293 and the active campaign tracker as doc-7.
<!-- SECTION:FINAL_SUMMARY:END -->
