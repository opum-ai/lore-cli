---
id: LORE-220
title: Freeze the manifest singletons returned by buildManifest()
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-concept-manifest
  - codex-review-followup
  - hardening
dependencies: []
priority: low
type: enhancement
ordinal: 322000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The manifest returned by `buildManifest()` (src/core/manifest.ts:427-434) is immutable — mutating it (or its nested command/flag entries) throws in strict mode / is a no-op — so shared state cannot be corrupted across calls in one process.

**Why:** `buildManifest()` returns the module-level `LORE_MANIFEST` (src/core/manifest.ts:144-415) and `GLOBAL_FLAGS` (L126-135) `const` arrays by reference with no `Object.freeze` and no defensive copy. The `readonly` modifiers on `Manifest`/`ManifestCommand`/`ManifestFlag` are compile-time-only, so a type-bypassing (`as any`) or plain-JS consumer could mutate the shared singleton and poison every later `buildManifest()`/`findManifestCommand()`/`manifestCommandNames()` read. This mirrors the codebase's own defensive convention — `Object.freeze` on YAML_LOAD_OPTIONS/YAML_DUMP_OPTIONS in src/core/concept.ts (L124, L138).

**Live context:** Impact is low in the run-once CLI (each invocation exits), but the shared-mutable-state hazard is real and the fix is a trivially-scoped hardening.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster core-concept-manifest; re-audit round 3 confirmed still-present against dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The object returned by buildManifest() is deeply immutable: the top-level envelope, the `commands` array, each command entry and its `flags` array/entries, and the `globalFlags` array/entries are frozen (or otherwise made non-mutable).
- [ ] #2 A new test in test/help.test.ts asserts that attempting to mutate the returned manifest (e.g. `buildManifest().commands.push(...)` or reassigning a command's `kind`) throws in strict mode or has no effect, and that a subsequent buildManifest() call returns unaffected data.
- [ ] #3 All existing test/help.test.ts assertions remain green (no shape/behavior change to the manifest data itself).
- [ ] #4 The full test suite (`bun test`) passes.
<!-- AC:END -->
