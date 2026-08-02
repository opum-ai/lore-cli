---
id: LCLI-293
title: Reconcile Lore CLI release truth handover lifecycle and Story ownership
status: To Do
assignee: []
created_date: '2026-08-02 03:36'
labels:
  - audit
  - documentation
  - release-truth
  - handover
  - lifecycle
  - coupling
  - follow-up
  - no-product-code
dependencies: []
references:
  - ../opum-doc/docs/reference/cross-product-documentation-authority-audit.md
  - >-
    backlog/tasks/lcli-253 -
    Track-upstream-Backlog.md-release-and-migrate-baseline.md
  - >-
    backlog/tasks/lcli-278 -
    Protect-the-release-environment-before-publication.md
documentation:
  - docs/index.md
  - docs/runbooks/lore-cli-release-campaign-handover.md
  - docs/runbooks/release-publishing.md
priority: high
type: docs
ordinal: 406000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Resolve the owner-local documentation debt identified by opum-doc OCLI-6 while preserving task history. Reconcile release and package claims with live owner evidence, replace competing executable handovers with one context-free route, classify obsolete archives as non-executable history, and couple live and historical tasks to appropriately scoped Lore Stories without changing product source or task lifecycle state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Active entry points describe the Lore CLI as unreleased until a non-placeholder version, immutable tag and artifact, clean registry install, and the LCLI-253 and LCLI-278 owner gates all provide consistent evidence
- [ ] #2 Exactly one context-free current handover remains, while obsolete current, .claude, and archived handovers are concise past-tense non-executable provenance with no pickup cursor, paste-ready prompt, runnable queue, or unclassified old LORE or /repos/lore identity
- [ ] #3 Live and historical tasks are grouped under appropriately scoped Lore Stories without changing their statuses or acceptance history, and lore orphans reports zero tasks and zero dangling links
- [ ] #4 The root index reaches the active Story, controlling ADR and Spec, release-truth record, ownership map, and current handover without claiming npm availability from planned release mechanics
- [ ] #5 Lore sync, strict validation and checking, agent checks, Story/task rollups, orphan checks, and git diff --check pass with no product-source, package, release, remote-policy, or user-worktree changes
<!-- AC:END -->
