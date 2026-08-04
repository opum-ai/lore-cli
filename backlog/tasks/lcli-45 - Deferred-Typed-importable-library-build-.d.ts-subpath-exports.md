---
id: LCLI-45
title: '[Deferred] Typed importable library build (.d.ts + subpath exports)'
status: To Do
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 23:44'
labels:
  - eck-alignment
  - packaging
  - 'doc:stories/hold-deferred-lore-capabilities'
milestone: m-12
dependencies:
  - LCLI-9
documentation:
  - docs/adr/0001-runtime-build-distribution.md
  - docs/stories/hold-deferred-lore-capabilities.md
priority: low
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the existing single-package publishing workflow by introducing @opum-ai/lore-core as the shared platform-neutral package while preserving the current platform package naming scheme. The plain-JS rejection in ADR-0001 was scoped to the first release, so this task must explicitly revisit that decision, document the package split, and prove compatible platform resolution before implementation ships.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0001 amended with a typed library artifact (secondary) subsection: single @opum-ai/lore package + subpath exports (/core, /contract); binary remains the primary CLI distribution
- [ ] #2 package.json exports map + .d.ts emit (tsc --emitDeclarationOnly or bun build) wired into the release pipeline (LCLI-9)
- [ ] #3 import-sanity test: import from @opum-ai/lore/core resolves and type-checks under Bun and Node
- [ ] #4 NO writable /backlog subpath: any exported Backlog surface is read-only/pure over the --json envelope; lore stays sole committer of backlog/ (ADR-0012)
- [ ] #5 library surface is an additive-only versioned contract, version-locked to the binary under one SemVer line; no business logic reachable only via import (ADR-0004 CLI-primacy)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DEFERRED per ECK-alignment follow-up (D2). lore stays a STANDALONE CLI: ECK and other consumers integrate via the CLI + --json contract (D3/D4/D5) plus the declarative .lore/profile (LCLI-46). With the type profile now config (not a code module ECK registers via import), there is no concrete need for an importable library, so this and the ADR-0001 library-artifact amendment are parked. Revisit ONLY if a real in-process import need appears — then via a fresh ADR-0001 extension. lore's locked distribution stays binary-first CLI (ADR-0001) + reusable internal core (ADR-0004).
<!-- SECTION:NOTES:END -->
