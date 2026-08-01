---
id: LCLI-289
title: Add task-scoped agent context profiles
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-31 01:16'
updated_date: '2026-08-01 17:47'
labels:
  - agents
  - context
  - retrieval
  - claude
  - codex
  - 'doc:stories/retrieve-task-scoped-context-with-agent-profiles'
dependencies:
  - LCLI-283.1.3
references:
  - >-
    https://github.com/salient-data/lore-doc/blob/dev/docs/adr/define-agent-profiles-as-context-mappings.md
  - >-
    https://github.com/salient-data/lore-doc/blob/dev/docs/reference/agent-profile-context-engineering-research.md
documentation:
  - docs/stories/retrieve-task-scoped-context-with-agent-profiles.md
  - docs/specs/agent-profile-context-retrieval.md
  - docs/runbooks/agent-profile-implementation-handover.md
priority: high
type: feature
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add named, version-controlled context profiles that let existing Claude Code and Codex agents retrieve deterministic task-scoped evidence from explicitly linked Lore documentation. Lore owns context mappings and orchestrator delegate rosters; it does not create agents, run models, or add hosted or MCP behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Strict specialist and orchestrator profiles validate names, budgets, pinned and ranked references, delegates, and acyclic relationships while a missing profile directory remains backward compatible.
- [x] #2 lore agent list, show, and context expose documented plain and JSON contracts with semantic errors and preserve every existing command contract.
- [x] #3 Context packs rank Markdown sections only inside the explicit profile allowlist, preserve mandatory pins and provenance, respect bounded output, and remain deterministic across indexed and reference retrieval.
- [x] #4 Orchestrator packs include only their own evidence and a compact direct-delegate roster; delegated workers retrieve their own profile context.
- [x] #5 Context emits to stdout by default and optionally writes safely and atomically without silent overwrite, symlink traversal, or repository path escape.
- [ ] #6 Generated Lore guidance documents the one-line Claude Code and Codex opt-in without creating or patching native agent definitions, and automated tests plus strict Lore gates pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the accepted Story/Spec/runbook onto current dev and activate LCLI-289 in the clean Treehouse lease, preserving the dirty primary checkout as an untouched source snapshot.\n2. Add a strict core profile snapshot loader for .lore/agents/*.toml: regular-file and filename/name checks, exact schema/unknown-key rejection, defaults, normalized concept/anchor references, overlap detection, bundle/anchor resolution, delegate existence/self/cycle validation, and missing-directory compatibility. (AC #1)\n3. Generalize the existing deterministic BM25 primitives for arbitrary profile section records without changing lore query, then add a pure Markdown section compiler with mandatory pins, heading/block boundaries, deterministic ranking/order, exact budget accounting, catalog/omission provenance, direct-delegate rosters, and indexed/reference byte parity. (AC #3, #4)\n4. Add the singular lore agent list/show/context dispatcher, manifest/help entries, stable plain/JSON envelopes, semantic usage/not_found/denied/conflict/validation errors, and pre-output validation/retrieval decisions while preserving plural lore agents and every existing command contract. (AC #2)\n5. Add repository-confined --task-file and --out handling using no-follow reads, whole-path symlink checks, atomic writes, unchanged detection, explicit --force collision policy, and no default write. (AC #5)\n6. Add focused profile, compiler, command/router/help, writer/security, bridge-guidance, and indexed/reference conformance tests, including malformed/cyclic/case-colliding profiles, anchors, budgets, deterministic output, orchestrator isolation, path escape, symlink, and collision cases.\n7. Update the existing Lore documentation contract from planned to shipped, regenerate generic Claude/Codex guidance through Lore, run focused and full pinned-runtime tests, lint, typecheck, compiled smokes, lore sync, strict validation/check, diff hygiene, adversarial self-review, and Backlog finalization. Do not commit, push, open/merge a PR, return leases, or alter the dirty primary checkout without separate authority. (AC #6)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation slice 1 (2026-08-01): reconciled LCLI-289 onto clean Treehouse lease da6a255ee4de274fcadf1e0e655b747b at integration base 010fd10. Added strict .lore/agents snapshot loading/reference/delegate validation, reusable arbitrary-record BM25 scoring, deterministic bounded Markdown-section evidence compilation, singular agent list/show/context routing and manifest/help contracts, atomic confined output handling, generated Claude/Codex opt-in guidance, and check-time profile validation. Focused agent/query/help/CLI/bridge/check suite passed 461 tests with two expected help golden failures; updated those additive command goldens. Verification currently uses host Bun 1.3.14, not the pinned 1.2.23, so it is development evidence only. The dirty primary checkout remains untouched.

Implementation slice 2 (2026-08-01): completed the shipped Story/Spec/runbook and ADR/reference/onboarding reconciliation; regenerated Claude and Codex Lore guidance; added whole-Markdown-block and check-time profile validation coverage; and corrected selected-item token estimates to include rendered BM25 provenance. Objective verification on host Bun 1.3.14: focused agent/query/help/init suite 175 pass; full suite 2362 pass / 0 fail / 7407 assertions; typecheck clean; Biome clean across 156 files; compiled binary build and help/agent-list smokes pass; generated Claude bridge check unchanged; lore validate --strict reports 0 errors/0 warnings; git diff --check passes. lore sync --dry-run reports exactly six generated docs changes (root/log/runbook/spec/story indexes plus Story reconciliation), and lore check --strict reports only the corresponding Story status and managed-block drift. The real sync is deferred because it auto-commits dirty backlog/ and no commit authority has been granted. AC #1-#5 are objectively verified; AC #6 and terminal completion remain open until the authorized sync/commit and post-sync strict check. Pinned Bun 1.2.23 is not installed on this host (.bun-version requests it; both discovered Bun binaries are 1.3.14), so pinned-runtime evidence also remains outstanding. Dirty primary checkout remains untouched; all reconciled work is in Treehouse lease da6a255ee4de274fcadf1e0e655b747b on feature/lcli-289-agent-context-profiles.

Final adversarial pass: confined --task-file to repo-relative non-symlink paths (stdin remains supported), added real-file/escape/symlink tests, and updated the Spec/runbook/help contract. Post-change focused command/help/CLI suite: 107 pass; post-change full suite: 2362 pass / 0 fail / 7415 assertions. Typecheck, Biome, and diff hygiene remain clean.

Pinned-runtime verification completed via ephemeral bun@1.2.23: full suite 2362 pass / 0 fail / 7415 assertions; typecheck clean; Biome clean across 156 files; compiled build succeeded; compiled help-agent and empty-profile-list JSON smokes passed. The earlier pinned-runtime gap is closed. Only Lore sync/commit authorization and the post-sync strict check remain for AC #6 and terminal completion.
<!-- SECTION:NOTES:END -->
