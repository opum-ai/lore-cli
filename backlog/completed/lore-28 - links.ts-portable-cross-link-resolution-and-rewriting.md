---
id: LORE-28
title: 'links.ts: portable cross-link resolution and rewriting'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-06-27 22:50'
labels:
  - core
milestone: m-4
dependencies:
  - LORE-16
documentation:
  - docs/adr/0010-multi-consumer-docs-layer.md
priority: high
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compute per-file relative, URL-encoded, .md-suffixed links (no leading slash, no wikilinks); resolve and rewrite; shared by new/sync/link/index-gen/managed-block.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Generated links resolve across GitHub/Obsidian/MkDocs/Docusaurus
- [x] #2 normalizeLink and validateLink are reused by other commands
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/core/links.ts as the canonical cross-link home (design §2.1 pure core: no print/flags/exit), exporting:
   - normalizeLink(fromPath, toPath, anchor?) -> canonical relative + URL-encoded + .md-suffixed + no-leading-slash destination. The WRITER reused by new/sync/link/index-gen/managed-block and rename rewrite. (AC#1: resolves across GitHub/Obsidian/MkDocs/Docusaurus.)
   - validateLink(target) -> LinkFinding[] portability classifier (issues: leading-slash, missing-extension, unencoded). The per-link primitive lore check's portability lint composes. (AC#2.)
   - Move shared string helpers (isExternalTarget, decodeTarget, stripFragment, stripQuery) from bundle.ts into links.ts as the single home; re-import them in bundle.ts (concrete reuse, behavior identical, bundle tests stay green).
2. Scope boundaries (deferred to owning tasks, NOT LORE-28): validateLinks(graph) resolution + heading anchors via remark-validate-links -> LORE-30 (check); rewriteInbound(graph) -> LORE-35 (rename/supersede), composes normalizeLink; body-text portability scan (wikilinks/embeds/Obsidian-isms/MDX <,{) -> LORE-30.
3. test/links.test.ts: golden normalizeLink (same-dir/parent/sibling/cross-tree, space->%20, anchor, idempotent re-normalize); validateLink findings per issue + clean cases + malformed-% and round-trip unencoded detection; confirm bundle.ts suite still green after the helper move.
4. Gates: bun test + bunx biome check + bunx tsc --noEmit + coverage (core 100%); then PR into dev for Jeremy to review/merge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/core/links.ts (commit c98dbb0 on feat/lore-28-links): normalizeLink (canonical writer) + validateLink (per-link portability classifier, LinkFinding[]) + moved shared destination classifiers (isExternalTarget/decodeTarget/stripFragment/stripQuery) out of bundle.ts into links.ts and re-imported them (concrete reuse). Pure core (design §2.1). Deferred to owning tasks: validateLinks(graph)+anchors -> LORE-30; rewriteInbound -> LORE-35; body-text Obsidian/MDX scan -> LORE-30. Gates green: 554 pass (+48), biome clean, tsc clean; links.ts 100% line/func, bundle.ts coverage net improved. /code-review max running before PR.

/code-review max (workflow, 36 agents) disposition — 4 CONFIRMED correctness bugs + 6 reuse/doc findings, all rooted in encodeURIComponent != portable markdown destination. Fixed in 740c689: (0) raw parens -> shared encodePathSegment escapes !'()* (also wired template.ts resourceFor: one encoder, no drift) [findings 0,10]; (2) lowercase-hex false-positive -> case-insensitive compare [2]; (7) asset links flagged -> only extensionless flagged [7]; (6) .MD -> coerce lowercase .md [6]; docs corrected: idempotency->determinism + toPath preconditions [1,8,13], colon-first-segment limitation documented (deferred to LORE-30 body-scan) [4]. Declined: collapse strip* [9], extract mid-level predicate [11] (resolver/linter diverge). Added writer<->linter round-trip invariant test. AC#1 (canonical form resolves across 4 renderers) + AC#2 (normalizeLink/validateLink exported & reused: encodePathSegments shared with template.ts, classifiers reused by bundle.ts) met. Gates: 560 pass, biome+tsc clean, links.ts & template.ts 100% line/func.

Delivered via PR #19 (squash 822592a on dev). Final branch state before merge: rebased onto dev to clear the post-#20 CHANGELOG conflict (kept both Unreleased/Added entries) and fixed the resourceFor resource-drift regression the shared encoder exposed — resourceDriftFindings now compares decode-tolerantly (decodeTarget both sides) so a pre-existing stamped resource is not falsely 'stale' under lore validate --strict on upgrade (+ regression test). All CI green; admin-squash-merged. LORE-30 now unblocked.
<!-- SECTION:NOTES:END -->
