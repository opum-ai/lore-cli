---
id: LORE-45
title: 'Typed library build: emit .d.ts + subpath exports for programmatic consumers'
status: To Do
assignee: []
created_date: '2026-06-21 20:15'
labels:
  - eck-alignment
  - packaging
milestone: m-1
dependencies:
  - LORE-9
documentation:
  - docs/adr/0001-runtime-build-distribution.md
priority: high
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend ADR-0001 to publish a SECONDARY typed library artifact alongside the binary-first CLI, so ECK (and other tools) can import lore modules instead of reimplementing them. Resolves D2 of the ECK<->Lore alignment. One @salient-data/lore package with subpath exports (/core, /contract) exposing the deterministic core/ functions; emit .d.ts. ADR-0001's plain-JS rejection was scoped to the PRIMARY distribution shape, so a secondary importable entry is a compatible extension; the compiled binary stays primary. Unblocks the registration/embed path (the profile-API task) and the shared-library north star.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0001 amended with a 'typed library artifact (secondary)' subsection: single @salient-data/lore package + subpath exports (/core, /contract); binary remains the primary CLI distribution
- [ ] #2 package.json exports map + .d.ts emit (tsc --emitDeclarationOnly or bun build) wired into the release pipeline (LORE-9)
- [ ] #3 import-sanity test: import from '@salient-data/lore/core' resolves and type-checks under Bun and Node
- [ ] #4 NO writable /backlog subpath: any exported Backlog surface is read-only/pure over the --json envelope; lore stays sole committer of backlog/ (ADR-0012)
- [ ] #5 library surface is an additive-only versioned contract, version-locked to the binary under one SemVer line; no business logic reachable only via import (ADR-0004 CLI-primacy)
<!-- AC:END -->
