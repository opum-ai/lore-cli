---
id: LCLI-329
title: Adopt the autonomous documentation campaign fast lane
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-14 01:34'
updated_date: '2026-08-14 21:33'
labels:
  - campaign
  - performance
  - automation
  - codex
  - docs
  - 'doc:stories/maintain-lore-cli-documentation-authority'
dependencies:
  - LCLI-328
references:
  - >-
    https://github.com/opum-ai/opum-doc/blob/dev/docs/reference/operate-autonomous-documentation-campaigns.md
documentation:
  - docs/stories/maintain-lore-cli-documentation-authority.md
modified_files:
  - AGENTS.md
  - .gitignore
  - treehouse.toml
  - .codex/skills/backlog-handover/SKILL.md
  - .codex/skills/backlog-handover/references/init.md
  - .codex/skills/backlog-handover/references/restore.md
  - .codex/skills/backlog-handover/references/handover.md
  - .codex/skills/backlog-handover/references/delivery.md
  - .codex/skills/backlog-handover/scripts/audit-handover-lifecycle.mjs
  - .codex/skills/backlog-handover/scripts/test-audit-handover-lifecycle.mjs
  - .codex/skills/backlog-handover/scripts/lore-authority-preflight.mjs
  - .codex/skills/treehouse-worktrees/SKILL.md
  - .codex/skills/treehouse-worktrees/agents/openai.yaml
  - .codex/skills/lore/SKILL.md
  - .claude/skills/lore/SKILL.md
  - src/core/agent-bridge.ts
  - src/core/codex-bridge.ts
  - test/backlog-handover-lifecycle.test.ts
  - docs/reference/operate-autonomous-lore-cli-documentation-campaigns.md
priority: high
type: enhancement
ordinal: 452000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the reviewed ODOC-54 campaign loop into lore-cli as a repository-local operating capability. Preserve lore-cli ownership and delivery boundaries, resolve the self-committing Lore-command authority gap, and replace conservative serial handovers with compact, bounded-parallel, tree-aware execution.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Lore-governed local reference records the portable fast-lane semantics, lore-cli-specific authority boundaries, self-committing command preflight, validation economy, and measurable operating targets, and is reachable from the bundle index.
- [x] #2 Trusted-project Codex configuration supplies Terra/medium defaults, four narrow documentation roles sharing no more than three concurrent agent slots, least-privilege filesystem and network access, and auto-reviewed mutations without copying opum-doc-specific repository authority.
- [x] #3 Repository instructions durably authorize selected non-production documentation campaigns, coordinator-owned shared state, bounded remediation and cleanup, while publication, production promotion, material decisions, and unrelated destructive actions remain explicit pause boundaries.
- [x] #4 The Codex and Claude backlog-handover bridges use progressive mode references, immediate init-to-execution, one compact tracker, widest safe bounded-parallel waves, exact-tree validation reuse, batched delivery, and concise lifecycle-safe handovers.
- [x] #5 Lifecycle and tracker audits plus fixtures enforce one executable cursor, no runnable archived cursor, repository-specific task IDs, line and byte limits, and safe handling of Lore commands that can commit.
- [x] #6 Backlog offline-read invariants, skill tests, configuration parsing, strict Lore validation and coherence checks, relevant repository tests, independent review, and diff hygiene pass at the exact reviewed tree.
- [ ] #7 Codex uses .codex/handovers/active.md as the sole executable campaign cursor; legacy .claude cursor state is migration-only and the Codex loop never loads .claude/skills/**
- [ ] #8 The loop has exactly two nonterminal stop classes, human-decision and session-renewal, and otherwise continues through review, commit, dev PR/merge, settlement, cleanup, and newly ready waves
- [ ] #9 A repository-local Treehouse skill and three-tree configuration provide fenced leases, coordinator-owned release, patch-equivalence cleanup, recovery preservation, and safe reusable-pool hygiene
- [ ] #10 Adversarial lifecycle fixtures reject duplicate or invalid stop classes, stale grounding, missing or unknown in-flight stages, contradictory lifecycle markers, Markdown-nested or foreign-task continuations, and completed campaigns retaining a live cursor
- [ ] #11 Session renewal durably records the live tracker, exact SHA/branch/worktree/queue/stage and tells the operator to run /clear, start a new lore-cli Codex session, invoke $backlog-handover restore, and continue without reconfirmation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reopen LCLI-329 and ground the exact Quest refinements against Lore CLI dev while preserving the hardened self-committing Lore preflight.
2. Move the Codex campaign cursor to .codex/handovers, mark .claude state migration-only, and explicitly exclude Claude skills from Codex execution.
3. Port the continuous task-review-commit-dev-PR-merge-settlement-cleanup-next-wave loop, two stop classes, exact renewal prompt, and dirty-worktree classification.
4. Add a Lore CLI-local Treehouse skill/config with three fenced reusable worktrees and coordinator-owned cleanup.
5. Expand lifecycle auditing and adversarial fixtures without weakening LCLI task-ID enforcement or the Lore authority preflight.
6. Update the Lore operating record, run focused/full/strict gates and independent review, deliver to dev, settle the tracker/task, and clean campaign-created artifacts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Post-authorization audit found the previous local Done state lacked project Codex config, all four role profiles, campaign rules, tracker enforcement, and a compatible active Claude backlog-handover bridge. Reopened and aligned AC2/AC4/AC5/AC6 to the explicitly approved four-role/three-slot target.

Final exact-tree evidence at HEAD 3a3cbe248e80aa1a379821ba69ee6bc011d8903d / tree 720eb1990161e590309e56917f402c96bcc7f6fd: four Terra/medium profiles share max three slots; Codex strict config and all five TOMLs parse; Backlog task reads remain offline; Claude and Codex bridges use progressive references; lifecycle 8 and tracker 3 fixtures pass; focused preflight/lifecycle suite passes 17; source bridge check, typecheck, Biome, full Bun suite (2584 pass, 1 skip, 0 fail), strict Lore validation/check (71 files, zero findings), diff hygiene, and independent review pass. Authority is Lore CLI-only, one PR per wave to dev, with dev-to-main, publication, material decisions, and unrelated destructive work excluded.

PR CI portability follow-up at HEAD 4b90e3b / tree b50ab787 hardened exact-root enforcement against Windows Git short-path aliases and made the preflight fixtures platform-native. Focused 17 tests, 8 lifecycle fixtures, 3 tracker fixtures, isolated full suite (2584 pass, 1 skip, 0 fail), typecheck, Biome, strict Lore, diff hygiene, and independent review pass.

Reopened at user request because the earlier Done state predates the final Quest refinements: Codex-only cursor separation, exact nonterminal stop taxonomy, Treehouse leases, stronger cleanup rules, and adversarial lifecycle coverage.

Implemented the Codex-only cursor and continuous-loop refinement while preserving the LCLI-328 Lore commit preflight. The canonical cursor is .codex/handovers/active.md; the stale LCLI-327 Claude cursor was removed after live reconciliation and the legacy directory passes complete-mode audit. Lifecycle coverage expanded from 8 to 26 script fixtures, and the 17-test repository lifecycle/preflight suite is green.

Treehouse forward validation acquired a real identity-fenced lease, observed its exact lease ID/holder through status, returned it with both guards, and confirmed the pool entry became available. Lore CLI uses an SSH remote, so Codex applies one consistent command-scoped SSH-to-HTTPS Git rewrite without mutating the persistent remote; the skill now warns that mixing transport identities selects different pools. A fresh Terra/medium subagent independently classified the returned entry as reusable infrastructure and found no safe prune candidate.

Adversarial hardening now strips fenced code and HTML comments from lifecycle evidence, normalizes Markdown formatting when detecting archived continuation signals, scans case-variant Markdown cursor names, enforces canonical exact grounding and unique uppercase LCLI task rows, and expands standalone coverage to 34 cases plus 21 focused Bun tests. The Lore sync preflight now enumerates tracked, staged, and untracked Backlog changes and requires an exact repeatable campaign-owned allowlist before dispatch, preventing Lore sync from committing unrelated dirty task state.
<!-- SECTION:NOTES:END -->
