---
id: LORE-28
title: 'links.ts: portable cross-link resolution and rewriting'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-06-26 23:55'
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
- [ ] #1 Generated links resolve across GitHub/Obsidian/MkDocs/Docusaurus
- [ ] #2 normalizeLink and validateLink are reused by other commands
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
