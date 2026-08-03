---
id: LCLI-293
title: Reconcile Lore CLI release truth handover lifecycle and Story ownership
status: Done
assignee:
  - '@codex'
created_date: '2026-08-02 03:36'
updated_date: '2026-08-03 17:15'
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
  - test/local-graph-contract.test.ts
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
- [x] #1 Active entry points describe the Lore CLI as unreleased until a non-placeholder version, immutable tag and artifact, clean registry install, and the LCLI-253 and LCLI-278 owner gates all provide consistent evidence
- [x] #2 Exactly one context-free current handover remains, while obsolete current, .claude, and archived handovers are concise past-tense non-executable provenance with no pickup cursor, paste-ready prompt, runnable queue, or unclassified old LORE or /repos/lore identity
- [x] #3 Live and historical tasks are grouped under appropriately scoped Lore Stories without changing their statuses or acceptance history, and lore orphans reports zero tasks and zero dangling links
- [x] #4 The root index reaches the active Story, controlling ADR and Spec, release-truth record, ownership map, and current handover without claiming npm availability from planned release mechanics
- [x] #5 Lore sync, strict validation and checking, agent checks, Story/task rollups, orphan checks, and git diff --check pass with no product-source, package, release, remote-policy, or user-worktree changes
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

Final verification on 2026-08-03: `lore sync --json` was idempotent (0 files changed, no Backlog commit); `lore validate --strict --json` passed 64 concepts with 0 errors/0 warnings; `lore check --strict --json` passed 64 files with 0 errors/0 warnings; `lore agents --check --json` reported both managed files unchanged; `lore orphans --json --limit 400` reported 0 orphan tasks and 0 dangling links; `git diff --check` passed. All seven Story rollups passed: foundation 70 Done, hardening 190 Done, first-release readiness 31 Done/1 To Do, deferred capabilities 4 To Do, local graph 21 Done, agent profiles 1 Done, and documentation authority 1 Done/1 In Progress before closure. Backlog JSON proved all 320 tasks have exactly one `doc:stories/` owner and lifecycle counts remained 314 Done, 5 To Do, 1 intentional In Progress; the task diff contained zero acceptance-checkbox changes. A scripted lifecycle audit found 120/120 tracked archives and 29/29 obsolete ignored handovers classified, one local pointer, exactly one docs handover, and zero prohibited stale-context hits. Release checks confirmed six `0.0.0` manifests, zero local/GitHub tags, zero GitHub releases, npm E404, LCLI-253 Done, and LCLI-278 To Do. The combined diff contained only README, docs, historical handovers, generated Lore bridge, campaign tracker, and Backlog coupling metadata; no product source, package metadata, release state, remote policy, or unrelated worktree changed. Adversarial self-review found and corrected five MDX-sensitive historical titles and the renamed LCLI-289 documentation path. No push, PR, merge, publication, cleanup, or remote mutation was performed.

Remote CI on PR #292 exposed one missed live test reference: test/local-graph-contract.test.ts still opened the retired release-campaign handover and asserted its executable cursor headings. Updated that test to open docs/runbooks/lore-cli-handover.md and enforce the new context-free contract (live-evidence route, authority boundaries, recovery, and no queue or paste-ready prompt). Focused verification passed 4 tests with 39 assertions; full platform CI will be rerun on the corrected head.

Pinned Bun 1.2.23 post-correction verification passed: Biome checked 185 files, TypeScript typecheck passed, and the full isolated suite passed 2,425 tests across 74 files with 8,009 assertions and zero failures. Git diff hygiene remained clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reconciled Lore CLI release truth as unreleased, added owner-scoped truth and ownership records, replaced stale delivery cursors with one context-free handover and concise historical provenance, and coupled all 320 Backlog tasks to exactly one scoped Story without changing acceptance history. Verified idempotent Lore sync, strict validation/checking (64 files, zero findings), agent bridge consistency, all Story rollups, zero orphans/dangling links, complete handover classification, live package/tag/registry gates, allowed-path scope, and Git diff hygiene.
<!-- SECTION:FINAL_SUMMARY:END -->
