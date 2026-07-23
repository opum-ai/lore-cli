---
id: LORE-213
title: 'Guard manifest `kind` against drift from each command''s emitted `kind:`'
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-concept-manifest
  - codex-review-followup
  - test-coverage
dependencies: []
priority: low
type: task
ordinal: 315000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** A test proves each command's manifest-declared `kind` equals the `kind:` its live handler actually emits, closing the last unguarded drift vector in the manifest.

**Why:** The manifest declares a per-command `kind` (src/core/manifest.ts, each ManifestCommand.kind, e.g. L200 `check.report`) and each command handler independently emits its own `kind:` literal (e.g. src/commands/check.ts:946 `kind: "check.report"`). Both are hand-maintained free strings — SuccessEnvelope.kind is typed `string` in src/output.ts:155/164 and there is no shared union binding the two (the only EnvelopeKind, src/adapters/backlog.ts:368, is the unrelated Backlog envelope). test/help.test.ts:45-51 only asserts `command.kind.length > 0`, so the manifest value and the emitted value can silently diverge. This is the one manifest field left unguarded: exitCodes is already drift-guarded by an independent golden cross-check (test/help.test.ts:62-94) and summary is guarded by sourcing from LORE_COMMANDS (test/help.test.ts:153-159).

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster core-concept-manifest; re-audit round 3 confirmed still-present against dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 test/help.test.ts (or a sibling test) asserts, for every manifest command, that its declared `kind` equals the `kind` the live command handler actually emits — via an independent golden table transcribed from each command's `kind:` literal (mirroring the existing exitCodes golden), and/or by invoking each command and reading its envelope `kind` where feasible.
- [ ] #2 The cross-check set is keyed by command name and pinned to equal manifestCommandNames() (as the exitCodes golden is at test/help.test.ts:89), so a newly added command must be given a kind mapping or the test fails.
- [ ] #3 Deliberately changing a manifest command's `kind` to a value the handler does not emit makes the new test fail (verify by a temporary local edit during development).
- [ ] #4 The full test suite (`bun test`) passes.
<!-- AC:END -->
