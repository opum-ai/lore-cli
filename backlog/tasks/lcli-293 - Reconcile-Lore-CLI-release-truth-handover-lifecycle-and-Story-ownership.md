---
id: LCLI-293
title: Reconcile Lore CLI release truth handover lifecycle and Story ownership
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-02 03:36'
updated_date: '2026-08-03 16:12'
labels:
  - audit
  - documentation
  - release-truth
  - handover
  - lifecycle
  - coupling
  - follow-up
  - no-product-code
  - 'doc:stories/maintain-lore-cli-documentation-authority'
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
  - docs/stories/maintain-lore-cli-documentation-authority.md
  - docs/reference/lore-cli-release-truth.md
  - docs/reference/lore-cli-documentation-ownership.md
  - docs/runbooks/lore-cli-handover.md
  - docs/runbooks/release-publishing.md
modified_files:
  - README.md
  - archive/handovers/
  - backlog/docs/
  - backlog/tasks/
  - docs/index.md
  - docs/reference/
  - docs/runbooks/
  - docs/stories/
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Ground release truth from live package metadata, tags, Backlog gates LCLI-253/LCLI-278, and current local evidence; correct active entry points without changing release state.
2. Create a Lore Story for LCLI-293 plus owner-scoped release-truth and documentation-ownership references, and route the root index to the active Story, ADR-0001, the release Spec/runbook control set, ownership map, truth record, and one context-free current handover.
3. Replace the stale release campaign cursor with the single current context-free handover; move obsolete docs handovers to historical Reference capsules and reduce tracked archive and ignored .claude handovers to concise past-tense provenance with no executable cursor.
4. Create a small, semantically scoped Story set for foundation, hardening, first-release readiness, deferred capabilities, local graph work, agent profiles, and documentation authority; couple every live and historical Backlog task exactly once through lore link while preserving status and acceptance history.
5. Run lore sync, strict validation/checking, lore agents --check, every Story rollup, lore orphans, stale-language scans, and git diff --check; adversarially review release truth, handover uniqueness, coupling coverage, and scope boundaries before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-03 restore: grounded doc-8 and live git state, dispatched wave 1, and recorded the implementation plan. Paused before documentation edits because acceptance criterion 3 requires `lore link`, whose repository contract automatically commits every affected Backlog task file. The active campaign explicitly grants no commit authority. No source or docs file has been edited, and no commit, push, PR, merge, publication, remote-policy change, or cleanup has been performed. Resume after the user explicitly authorizes the local commits required by Lore coupling (remote delivery remains separately unauthorized).

2026-08-03 implementation: the user explicitly approved the local commits required to complete LCLI-293; that approval does not include push, PR, merge, publication, cleanup, or remote-policy mutation. Created six scoped Story owners, retained LCLI-289 in its existing agent-profile Story, and coupled the other 319 tasks through Lore. Initial `lore orphans --json --limit 400` now reports zero orphan tasks and zero dangling links. Corrected active release claims from live evidence (all six manifests 0.0.0, zero GitHub releases/tags, npm 404, LCLI-253 Done, LCLI-278 To Do), added release-truth and ownership References, replaced three stale runbook handovers with one current route plus two historical capsules, and reduced 120 tracked plus 29 obsolete ignored handovers to non-executable provenance.
<!-- SECTION:NOTES:END -->
