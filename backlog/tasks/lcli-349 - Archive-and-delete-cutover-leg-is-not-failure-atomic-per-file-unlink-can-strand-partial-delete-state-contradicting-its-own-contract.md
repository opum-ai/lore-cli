---
id: LCLI-349
title: >-
  Archive-and-delete cutover leg is not failure-atomic: per-file unlink can
  strand partial-delete state contradicting its own contract
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-25 21:15'
updated_date: '2026-08-25 21:15'
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
- [ ] #1 Every original regular Backlog file is, after any detected drift/failure at any point, either still recoverably present or present in the verified immutable archive; no undocumented partial-delete state
- [ ] #2 Atomic commit boundary (staging directory rename) with verified archive and rollback/recoverable-staging semantics on post-commit failure
- [ ] #3 Existing symlink/unsafe-entry/refusal guards, deterministic zip+inventory integrity, source immutability until the commit boundary, resumable adoption state, no dual write, tracker selected last all preserved
- [ ] #4 Implementation, docstrings, CLI error/hint text, and runbook/ADR claims agree exactly
- [ ] #5 Red-capable tests inject drift and failures at multiple ordering/commit points incl late-path drift and delete/rename failure plus retry/resume coherence; suite does not bless silent loss
- [ ] #6 Focused + full repo tests/checks, tsc, biome, strict lore validate/check, git diff --check, package/install smoke, real Backlog-to-Quest adoption/archive smoke pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pre-commit: plan snapshot, build+verify archive, batched re-hash of EVERY source (source immutability until commit boundary). 2. Commit boundary: single atomic rename backlog -> .lore/cutover/staging-backlog-<id>. 3. Post-commit: re-verify staged tree against inventory, then unlink within staging; any post-commit failure leaves the full staged tree recoverably present under a durable documented path (never silent loss); rollback rename when staging is still complete. 4. Docstring/hint/runbook text updated to match. 5. Red tests at each ordering point.
<!-- SECTION:PLAN:END -->
