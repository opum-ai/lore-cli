---
id: LCLI-349
title: >-
  Archive-and-delete cutover leg is not failure-atomic: per-file unlink can
  strand partial-delete state contradicting its own contract
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-25 21:15'
updated_date: '2026-08-25 21:39'
labels:
  - bug
  - quest
  - tracker
dependencies: []
ordinal: 472000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/backlog-archive.ts re-hashes and unlinks files one by one; a drift or unlink failure on a later file leaves earlier files already deleted, while the module doc and error hint claim backlog/ is intact. Required: a transaction seam (atomic staging rename + verified archive) where every original regular Backlog file is provably either still recoverably present or present in the verified immutable archive under every detected drift/failure; no undocumented partial-delete state. Docstrings, CLI hints, runbook claims, and tests must agree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every original regular Backlog file is, after any detected drift/failure at any point, either still recoverably present or present in the verified immutable archive; no undocumented partial-delete state
- [x] #2 Atomic commit boundary (staging directory rename) with verified archive and rollback/recoverable-staging semantics on post-commit failure
- [x] #3 Existing symlink/unsafe-entry/refusal guards, deterministic zip+inventory integrity, source immutability until the commit boundary, resumable adoption state, no dual write, tracker selected last all preserved
- [x] #4 Implementation, docstrings, CLI error/hint text, and runbook/ADR claims agree exactly
- [x] #5 Red-capable tests inject drift and failures at multiple ordering/commit points incl late-path drift and delete/rename failure plus retry/resume coherence; suite does not bless silent loss
- [x] #6 Focused + full repo tests/checks, tsc, biome, strict lore validate/check, git diff --check, package/install smoke, real Backlog-to-Quest adoption/archive smoke pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pre-commit: plan snapshot, build+verify archive, batched re-hash of EVERY source (source immutability until commit boundary). 2. Commit boundary: single atomic rename backlog -> .lore/cutover/staging-backlog-<id>. 3. Post-commit: re-verify staged tree against inventory, then unlink within staging; any post-commit failure leaves the full staged tree recoverably present under a durable documented path (never silent loss); rollback rename when staging is still complete. 4. Docstring/hint/runbook text updated to match. 5. Red tests at each ordering point.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered on feat/lcli-333-archive-atomicity (base 3a25862): archiveAndDeleteBacklog is now a failure-atomic transaction. Phase 1 pre-commit (snapshot, build+verify archive, batched re-hash of every source) aborts with backlog/ untouched and no partial zip. Commit boundary = one atomic rename backlog -> .lore/cutover/staging-backlog-<id> (observed-state classification when a thrown rename still moved). Post-commit: staged tree re-verified against inventory before deletion; complete-tree faults roll back to backlog/ and report 'rolled back'; mid-deletion faults keep BOTH evidence paths (verified archive zipRel + recoverable stagingRel) via structurally classified recovery errors (input.stagingRel, never prose regex). ArchiveTransaction seam injects rename+unlink for red tests. Tests: pre-commit drift intact; rename refusal intact; post-commit fault full rollback restores bytes; real mid-deletion unlink fault through public API retains zip round-trip + staged remainder; staging conflict conflict-loud. Full bun test 2653 pass / 5 pre-existing config.test.ts failures identical at base; tsc/biome clean; strict lore validate/check exit 0; git diff --check clean; npm pack + real Backlog1.50.1/Quest0.2.7 adoption/archive smoke green (phase done, T-1/T-2, docs/adr adopted).
<!-- SECTION:NOTES:END -->
