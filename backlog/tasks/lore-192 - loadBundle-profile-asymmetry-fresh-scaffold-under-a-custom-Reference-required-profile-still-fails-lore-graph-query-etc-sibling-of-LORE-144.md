---
id: LORE-192
title: >-
  loadBundle profile asymmetry: fresh scaffold under a custom Reference-required
  profile still fails lore graph/query/etc (sibling of LORE-144)
status: To Do
assignee: []
created_date: '2026-07-22 23:21'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
priority: medium
type: bug
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LORE-144 (wave 11) fixed the write/read profile asymmetry for `lore validate` only, by exempting the reserved root docs/index.md via effectiveProfileFor in src/core/validate.ts. The SAME root cause survives at the loadBundle seam: src/core/bundle.ts loadBundle parses every concept via tryParseConcept against the caller-forwarded ACTIVE profile and throws a validation LoreError on failure, so loadBundle-based commands still fail on a freshly scaffolded bundle under a custom profile that adds a required field to the Reference type. Empirically confirmed by the LORE-144 review: in a scratch project where `lore validate` now passes, `lore graph` exits 6 with "invalid Reference frontmatter in index.md: owner: expected string, received undefined". `lore check` passes clean (separate parse path). IMPORTANT for the fix: loadBundles path space is bundle-root-relative ("index.md"), NOT repo-relative ("docs/index.md"), so a naive reuse of validate.ts effectiveProfileFor would silently miss — the reserved-root exemption must be applied in loadBundle at the bundle-relative root index path. Likely-affected commands share the loadBundle-profile-forwarding pattern (graph confirmed; query/sync/link/context are the same call shape). Wave-11 (LORE-144) per-task review finding (medium).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A freshly scaffolded bundle (`lore init`) under an active profile that adds a required field to the Reference type can run loadBundle-based commands (e.g. `lore graph`) without a validation error on the reserved root docs/index.md
- [ ] #2 The reserved-root exemption is applied at loadBundles bundle-relative root index path (not a repo-relative match), consistent with LORE-144s validate.ts carve-out
- [ ] #3 A regression test covers init-then-graph (or another loadBundle command) under such a profile, asserting no validation failure on the scaffolded root index; existing behavior for non-root concepts unchanged
<!-- AC:END -->
