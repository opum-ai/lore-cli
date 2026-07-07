---
id: LORE-50
title: >-
  dedupe multi-root check reconciliation: shared task ids + config validation
  across bundle roots
status: To Do
assignee: []
created_date: '2026-07-07 04:11'
labels:
  - cmd
dependencies:
  - LORE-27
priority: low
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore check's status/managed-block drift pass (LORE-27) resolves reconciliation independently per
bundle root when [paths...] names more than one root: each call to gatherReconciliation
(commands/reconcile-shared.ts) re-reads/re-validates backlog/config.yml and .lore/config.toml, and
re-resolves a task id via the Backlog adapter even if the SAME id is linked from concepts in two
different roots -- deduped only within one bundle root's own concepts, never across roots.

This was flagged three times across LORE-27's /code-review max rounds (1, 2, 3), each time
deliberately deferred as a correctness-neutral, narrow multi-root edge case (most real usage is the
single default docs/ root) whose proper fix -- gathering every bundle root's concepts into one
combined pool BEFORE calling gatherReconciliation, so config validation and task resolution both
happen exactly once for the whole run -- is a real restructuring of computeDriftFindings'
per-bundle-root loop, not a small change, and the review explicitly reclassified it as
performance/cleanup-grade (never correctness) every time.

Fix: restructure commands/check.ts's computeDriftFindings (and possibly
commands/reconcile-shared.ts's gatherReconciliation contract) so multi-root check gathers concepts
from every root first, resolves the union of linked task ids once, and validates
config/status-flow once -- while still attributing each per-concept finding back to its own bundle
root's label (the existing multi-root file-labeling convention must be preserved).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Multi-root lore check resolves each distinct linked task id at most once across the whole run, not once per bundle root
- [ ] #2 Multi-root lore check validates backlog/config.yml and .lore/config.toml at most once across the whole run
- [ ] #3 Per-concept drift findings are still correctly attributed to their own bundle root's label
<!-- AC:END -->
