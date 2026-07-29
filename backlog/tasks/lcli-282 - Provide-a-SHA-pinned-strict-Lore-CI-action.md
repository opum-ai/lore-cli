---
id: LCLI-282
title: Provide a SHA-pinned strict Lore CI action
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-29 02:27'
updated_date: '2026-07-29 02:46'
labels:
  - ci
  - github-actions
  - consumers
dependencies: []
priority: high
type: task
ordinal: 384000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose a private organization-scoped composite action that runs this checkout's exact Lore source against a caller repository, so private component repositories can run strict validation and coherence without a PAT or unpublished npm package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The composite action installs the pinned Bun toolchain and frozen lore-cli dependencies from its own SHA-pinned checkout
- [ ] #2 A caller can run lore validate --strict and lore check --strict against its workspace without receiving a lore-cli repository token
- [ ] #3 Private action access is limited to repositories in the salient-data organization
- [ ] #4 A real lore-graph workflow invocation passes both strict gates using an immutable lore-cli commit SHA
- [ ] #5 lore-cli typecheck, lint, full tests, build, strict Lore gates, and diff checks remain passing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a small composite action under .github/actions that installs frozen lore-cli dependencies and invokes validate/check against a caller-selected working directory. 2. Document and enforce SHA pinning at consumer call sites. 3. Restrict private action reuse to salient-data organization repositories. 4. Update lore-graph CI to use the immutable action commit and verify a real workflow run. 5. Re-run lore-cli and Lore gates, then finalize the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The first real lore-graph invocation reached the private action and passed validation, then proved npm Backlog.md 1.48.0 is not --json-capable. Replaced that release install with the existing Docker-E2E provenance: build upstream MrLesk/Backlog.md at commit 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 and put the compiled binary on PATH.
<!-- SECTION:NOTES:END -->
