---
id: LORE-191
title: >-
  Discovery advisories are lost when checkBundles throws in the scan phase
  (post-LORE-138)
status: To Do
assignee: []
created_date: '2026-07-22 23:20'
labels:
  - codex-review-followup
  - cmd-check
dependencies: []
priority: low
type: bug
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
commands/check.ts flushes discovery advisories (around line 169) AFTER checkBundles(bundles) (around line 145). Before LORE-138 (wave 11) the bundle scan could not throw (bodyText swallowed every gray-matter exception). Post-LORE-138 a real input (e.g. a `---toml` frontmatter fence, proven by the new test/check.test.ts case) makes bodyText re-throw a plain Error out of the scan, so advisories collected around line 144 are lost and no report emits (exit 1 uncaught). The comment block at lines ~160-168 explicitly reasons that deferring the flush risks losing advisories entirely — the new scan-phase throw violates that stated guarantee. Fix: flush the collected discovery advisories right after collectBundles (the collectors only feed) so they survive a later scan/reconcile throw. Wave-11 integration-review finding (low).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Discovery advisories collected before checkBundles are surfaced to the user even when checkBundles throws in the scan phase
- [ ] #2 A regression test proves the collected advisories survive a scan-phase throw (e.g. a non-YAML gray-matter error) rather than being silently dropped
<!-- AC:END -->
