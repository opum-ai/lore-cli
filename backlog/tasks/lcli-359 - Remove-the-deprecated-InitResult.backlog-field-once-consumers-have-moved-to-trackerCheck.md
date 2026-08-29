---
id: LCLI-359
title: >-
  Remove the deprecated InitResult.backlog field once consumers have moved to
  trackerCheck
status: To Do
assignee: []
created_date: '2026-08-28 23:59'
labels:
  - init
  - tracker
  - cleanup
  - breaking
dependencies: []
ordinal: 486000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LCLI-358.2 replaced `lore init`'s Backlog-only capability field with `trackerCheck`, which names whichever backend was probed. The old `backlog` field was kept, marked @deprecated, and is now populated ONLY when the selected backend is backlog — its exact historical meaning — so no existing `--json` consumer broke and none can read a Quest probe as a Backlog one.

That compatibility shim is deliberate but not permanent. Two fields describing one fact is the kind of redundancy that outlives the reason for it, and `src/commands/init.ts`'s `legacyBacklogCheck` exists solely to feed it.

Removing it is a breaking change to a documented `--json` field (docs/reference/cli-surface.md describes both), so it needs a release boundary and a changelog entry rather than a quiet drop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 InitResult.backlog and legacyBacklogCheck are removed, with trackerCheck the only capability field
- [ ] #2 docs/reference/cli-surface.md and the CLI manifest describe only trackerCheck
- [ ] #3 The removal is recorded as a breaking change in CHANGELOG.md against a specific release
<!-- AC:END -->
