---
id: LCLI-359
title: >-
  Remove the deprecated InitResult.backlog field once consumers have moved to
  trackerCheck
status: To Do
assignee: []
created_date: '2026-08-28 23:59'
updated_date: '2026-08-30 00:06'
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

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-30 00:06
---
NOT ACTIONABLE YET, and deliberately left undone on 2026-08-29 rather than picked up as available cleanup. Read the title: 'once consumers have moved to trackerCheck'. That precondition is not met and cannot be.

trackerCheck was introduced by LCLI-358.2, which ships for the FIRST TIME in 0.3.5 -- cut today, merged to dev at a99391d, and not yet published to npm. No consumer can have moved to a field that has never been released. Removing the deprecated 'backlog' field now would delete a compatibility shim before the release introducing its replacement has reached the registry, giving every --json consumer a zero-release migration window.

AC#3 asks for the removal to be recorded 'against a specific release'. The right release is NOT the one immediately following 0.3.5 by default. Pick it by evidence that consumers have migrated, not by elapsed releases.

Before starting this:
1. 0.3.5 must be published, so trackerCheck exists in a released artifact.
2. At least one further release should carry both fields, so a consumer has a version to pin while migrating.
3. Check known in-repo and cross-repo consumers of InitResult for direct reads of the 'backlog' field -- opum-cli-e2e's contract suites assert on 'lore init --json' output and are the most likely reader.

The shim is cheap: one field plus legacyBacklogCheck in src/commands/init.ts, populated only when the selected backend is backlog, so it cannot misreport a Quest probe. Carrying it another release costs almost nothing; removing it early costs a consumer a broken parse with no version to fall back to.
---
<!-- COMMENTS:END -->
