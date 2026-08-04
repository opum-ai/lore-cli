---
id: LCLI-282
title: Provide a SHA-pinned strict Lore CI action
status: Done
assignee:
  - '@codex'
created_date: '2026-07-29 02:27'
updated_date: '2026-08-03 16:10'
labels:
  - ci
  - github-actions
  - consumers
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
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
- [x] #1 The composite action installs the pinned Bun toolchain and frozen lore-cli dependencies from its own SHA-pinned checkout
- [x] #2 A caller can run lore validate --strict and lore check --strict against its workspace without receiving a lore-cli repository token
- [x] #3 Private action access is limited to repositories in the salient-data organization
- [x] #4 A real lore-graph workflow invocation passes both strict gates using an immutable lore-cli commit SHA
- [x] #5 lore-cli typecheck, lint, full tests, build, strict Lore gates, and diff checks remain passing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a small composite action under .github/actions that installs frozen lore-cli dependencies and invokes validate/check against a caller-selected working directory. 2. Document and enforce SHA pinning at consumer call sites. 3. Restrict private action reuse to salient-data organization repositories. 4. Update lore-graph CI to use the immutable action commit and verify a real workflow run. 5. Re-run lore-cli and Lore gates, then finalize the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The first real lore-graph invocation reached the private action and passed validation, then proved npm Backlog.md 1.48.0 is not --json-capable. Replaced that release install with the existing Docker-E2E provenance: build upstream MrLesk/Backlog.md at commit 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 and put the compiled binary on PATH.

Objective verification: lore-graph Actions run 30418024712 resolved the private action at immutable SHA 05005738d705830a9029b35a82cdda6152458e9c without a repository token and passed both strict gates; GitHub reports lore-cli private action access_level=organization; PR #265 passed Ubuntu/Windows lint, typecheck, 2,201 tests, compile, docs scaffolds, and the five-minute Docker E2E harness. Local binary build, strict Lore validation/check, and diff checks also passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published an organization-private, SHA-pinned composite action that installs exact Lore dependencies, builds the JSON-capable Backlog PR #790 commit, and runs strict validation/coherence in callers. Verified by successful lore-graph run 30418024712 and all six protected lore-cli PR #265 checks.
<!-- SECTION:FINAL_SUMMARY:END -->
