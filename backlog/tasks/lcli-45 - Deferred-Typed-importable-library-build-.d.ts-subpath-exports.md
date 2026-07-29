---
id: LCLI-45
title: '[Deferred] Typed importable library build (.d.ts + subpath exports)'
status: To Do
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:23'
labels:
  - eck-alignment
  - packaging
milestone: m-9
dependencies:
  - LCLI-9
documentation:
  - docs/adr/0001-runtime-build-distribution.md
priority: low
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend ADR-0001 to publish a SECONDARY typed library artifact alongside the binary-first CLI, so ECK (and other tools) can import lore modules instead of reimplementing them. Resolves D2 of the ECK<->Lore alignment. One @salient-data/lore package with subpath exports (/core, /contract) exposing the deterministic core/ functions; emit .d.ts. ADR-0001's plain-JS rejection was scoped to the PRIMARY distribution shape, so a secondary importable entry is a compatible extension; the compiled binary stays primary. Unblocks the registration/embed path (the profile-API task) and the shared-library north star.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0001 amended with a 'typed library artifact (secondary)' subsection: single @salient-data/lore package + subpath exports (/core, /contract); binary remains the primary CLI distribution
- [ ] #2 package.json exports map + .d.ts emit (tsc --emitDeclarationOnly or bun build) wired into the release pipeline (LCLI-9)
- [ ] #3 import-sanity test: import from '@salient-data/lore/core' resolves and type-checks under Bun and Node
- [ ] #4 NO writable /backlog subpath: any exported Backlog surface is read-only/pure over the --json envelope; lore stays sole committer of backlog/ (ADR-0012)
- [ ] #5 library surface is an additive-only versioned contract, version-locked to the binary under one SemVer line; no business logic reachable only via import (ADR-0004 CLI-primacy)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DEFERRED per ECK-alignment follow-up (D2). lore stays a STANDALONE CLI: ECK and other consumers integrate via the CLI + --json contract (D3/D4/D5) plus the declarative .lore/profile (LCLI-46). With the type profile now config (not a code module ECK registers via import), there is no concrete need for an importable library, so this and the ADR-0001 library-artifact amendment are parked. Revisit ONLY if a real in-process import need appears — then via a fresh ADR-0001 extension. lore's locked distribution stays binary-first CLI (ADR-0001) + reusable internal core (ADR-0004).
<!-- SECTION:NOTES:END -->
