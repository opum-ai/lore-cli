---
id: LCLI-335
title: Prevent Bun environment-file access from breaking Lore Backlog probes
status: Done
assignee:
  - '@codex'
created_date: '2026-08-16 18:04'
updated_date: '2026-08-19 00:27'
labels:
  - backlog
  - workspace
  - sandbox
  - regression
  - 'doc:stories/harden-post-0-2-lore-correctness'
dependencies: []
references:
  - >-
    /Volumes/external/repos/opum-doc/docs/runbooks/query-the-opum-family-lore-workspace.md
documentation:
  - docs/stories/harden-post-0-2-lore-correctness.md
modified_files:
  - src/adapters/backlog.ts
  - test/backlog-probe.test.ts
priority: high
type: bug
ordinal: 458000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lore runs the Bun-backed Backlog CLI from each logical project root. In sandboxes where an ambient environment file at that root is deliberately unreadable, Bun can exit before `backlog --version` emits output. Lore currently misclassifies that launch failure as an old or non-JSON-capable Backlog CLI, blocking repository-local checks/exports and workspace member loading. Preserve the logical project root while launching the dependency from a safe cwd without reading, copying, or weakening protection of environment files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backlog subprocesses retain the intended logical project/member root without ambient Bun environment-file loading from that root.
- [x] #2 A failed `backlog --version` probe is diagnosed as a subprocess launch/probe failure, not as lack of `--json` support.
- [x] #3 An actually old or non-JSON-capable Backlog CLI retains the existing actionable capability diagnostic.
- [x] #4 Regression coverage uses an unreadable/protected environment sentinel and covers repository-local check/export plus multi-repository workspace member loading.
- [x] #5 Owner-local and workspace behavior remain unchanged when Backlog runs normally.
- [x] #6 Focused and full tests, typecheck, lint, build, strict Lore validation/check, bridge parity/drift checks, and diff hygiene pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace Backlog adapter and workspace export call sites, then reproduce the protected-environment probe failure with a bounded fixture. 2. Isolate Bun-backed Backlog subprocess launches in a safe cwd while preserving the logical project root through the supported environment contract. 3. Classify version-probe launch failures separately from actual capability failures. 4. Add repository-local and workspace regression coverage plus normal-path coverage. 5. Run focused and full verification, reconcile Backlog/Lore state, and deliver through the repository branch policy.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created after no matching Backlog task was found. LCLI-334 remains a separate completed discoverability enhancement; this task owns the subprocess isolation and diagnostic regression.

Implemented isolated Backlog subprocess launches with a fresh empty temporary cwd and BACKLOG_CWD logical-root handoff. Added protected-environment and distinct workspace-member regressions; focused adapter tests, tracker/workspace tests, typecheck, and diff hygiene pass.

Final verification passed: direct source export probes Backlog 1.50.1 from an isolated cwd; repository-local export; focused adapter, tracker, and workspace suites; full bun test suite; typecheck; Biome lint; compiled build; source strict Lore validate/check; source agents/codex bridge drift checks; and git diff --check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Isolated every Backlog subprocess in a fresh empty temporary cwd and passed the intended repository/member root through BACKLOG_CWD, preventing ambient Bun environment-file loading without touching protected files. Version-probe launch failures now report an environment/probe failure rather than falsely claiming Backlog lacks --json support. Added protected-environment and multi-member-root regressions; verified by focused and full project gates.
<!-- SECTION:FINAL_SUMMARY:END -->
