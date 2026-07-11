---
id: LORE-9
title: 'Release pipeline: compiled binaries + dual-artifact npm publish'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-07-11 17:08'
labels:
  - ci
  - release
milestone: m-1
dependencies:
  - LORE-8
documentation:
  - docs/adr/0001-runtime-build-distribution.md
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-platform -baseline bun build --compile, Node .cjs launcher + per-platform binary optionalDependencies, trusted publishing, post-publish install-sanity polling.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A dry-run release produces all platform artifacts
- [ ] #2 npx @salient-data/lore resolves the right binary
<!-- AC:END -->
