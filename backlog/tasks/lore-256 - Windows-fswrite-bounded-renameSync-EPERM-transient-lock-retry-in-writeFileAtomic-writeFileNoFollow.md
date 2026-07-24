---
id: LORE-256
title: >-
  Windows fswrite: bounded renameSync EPERM/transient-lock retry in
  writeFileAtomic/writeFileNoFollow
status: To Do
assignee: []
created_date: '2026-07-24 18:41'
labels:
  - cross-platform
  - build-ci-config
dependencies: []
references:
  - src/commands/fswrite.ts
priority: low
type: bug
ordinal: 358000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Harden the atomic write commit against transient Windows failures: writeFileAtomic and writeFileNoFollow finish with a write-temp-then-renameSync-over-destination, and on Windows that rename can intermittently fail with EPERM/EBUSY/EACCES when an antivirus scanner or the Search indexer holds a brief lock on the destination. Add a small bounded retry-with-backoff around the rename.

## Why it matters
LORE-252 fixed the deterministic Bun/Windows openSync ENOENT and turned the windows-latest CI leg green, but deliberately did NOT harden the rename step. Transient rename-over-existing locks are a real (if intermittent) failure mode for lore agents/sync/replace/schema/scaffold --force on end-user Windows machines, and could also flake CI. The canonical write-file-atomic library handles exactly this with a retry. Low priority: a hazard, not yet observed.

## Context
src/commands/fswrite.ts writeFileAtomic (~L288 renameSync) and writeFileNoFollow (~L773). Must preserve LORE-231 temp-leak guard, LORE-117 mode/ownership, LORE-130/92 symlink safety, and per-file atomicity. See LORE-252 (Done) for the primitive the rename now sits behind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 renameSync-over-existing in both writeFileAtomic and writeFileNoFollow retries a bounded number of times with backoff on the Windows transient-lock codes (EPERM/EBUSY/EACCES), then surfaces the failure via ioError if retries exhaust.
- [ ] #2 The retry preserves every existing invariant: LORE-231 temp-leak guard, LORE-117 mode/ownership preservation, LORE-130/92 symlink safety, per-file rename atomicity.
- [ ] #3 A test injects a transient rename failure that succeeds on a later attempt (deterministic, injected — not a real lock), and asserts no behavior change on POSIX.
- [ ] #4 windows-latest CI leg and the full suite stay green; typecheck and biome clean.
<!-- AC:END -->
