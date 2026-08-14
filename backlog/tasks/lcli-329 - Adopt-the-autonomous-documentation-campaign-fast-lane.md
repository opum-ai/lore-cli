---
id: LCLI-329
title: Adopt the autonomous documentation campaign fast lane
status: Done
assignee:
  - '@codex'
created_date: '2026-08-14 01:34'
updated_date: '2026-08-14 03:35'
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
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the ODOC-54 fast-lane contract with Lore CLI authority and the hardened LCLI-328 preflight.
2. Add trusted-project Terra/medium defaults, four narrow roles sharing three concurrent slots, Lore CLI-only least-privilege permissions, and dev-only autonomous-docs rules.
3. Replace both active backlog-handover bridges with progressive references and add mechanical lifecycle and stdin tracker audits with LCLI fixtures.
4. Generate both Lore bridges from source-backed preflight guidance, reconcile the Lore operating reference and managed surfaces, and keep Backlog reads offline.
5. Run configuration, script, lifecycle, tracker, bridge, strict Lore, typecheck, lint, full test, and diff gates at one exact tree; obtain independent review and deliver one PR to dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Post-authorization audit found the previous local Done state lacked project Codex config, all four role profiles, campaign rules, tracker enforcement, and a compatible active Claude backlog-handover bridge. Reopened and aligned AC2/AC4/AC5/AC6 to the explicitly approved four-role/three-slot target.

Final exact-tree evidence at HEAD 3a3cbe248e80aa1a379821ba69ee6bc011d8903d / tree 720eb1990161e590309e56917f402c96bcc7f6fd: four Terra/medium profiles share max three slots; Codex strict config and all five TOMLs parse; Backlog task reads remain offline; Claude and Codex bridges use progressive references; lifecycle 8 and tracker 3 fixtures pass; focused preflight/lifecycle suite passes 17; source bridge check, typecheck, Biome, full Bun suite (2584 pass, 1 skip, 0 fail), strict Lore validation/check (71 files, zero findings), diff hygiene, and independent review pass. Authority is Lore CLI-only, one PR per wave to dev, with dev-to-main, publication, material decisions, and unrelated destructive work excluded.

PR CI portability follow-up at HEAD 4b90e3b / tree b50ab787 hardened exact-root enforcement against Windows Git short-path aliases and made the preflight fixtures platform-native. Focused 17 tests, 8 lifecycle fixtures, 3 tracker fixtures, isolated full suite (2584 pass, 1 skip, 0 fail), typecheck, Biome, strict Lore, diff hygiene, and independent review pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adopted the Lore CLI autonomous documentation fast lane: four Terra/medium roles sharing three slots, GitHub-only and environment-denied permissions, offline Backlog reads, dev-only campaign authority, progressive Claude/Codex bridges, exact-tree gate reuse, mechanical tracker/lifecycle limits, and a hardened self-committing Lore preflight. Verified by 2,584 full-suite tests plus all focused, configuration, bridge, Lore, lint, typecheck, diff, and independent-review gates at tree 720eb199.

Cross-platform CI preflight coverage is green locally and independently reviewed at tree b50ab787.
<!-- SECTION:FINAL_SUMMARY:END -->
