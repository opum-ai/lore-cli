---
id: LCLI-213
title: 'Guard manifest `kind` against drift from each command''s emitted `kind:`'
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - core-concept-manifest
  - codex-review-followup
  - test-coverage
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
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
- [x] #1 test/help.test.ts (or a sibling test) asserts, for every manifest command, that its declared `kind` equals the `kind` the live command handler actually emits — via an independent golden table transcribed from each command's `kind:` literal (mirroring the existing exitCodes golden), and/or by invoking each command and reading its envelope `kind` where feasible.
- [x] #2 The cross-check set is keyed by command name and pinned to equal manifestCommandNames() (as the exitCodes golden is at test/help.test.ts:89), so a newly added command must be given a kind mapping or the test fails.
- [x] #3 Deliberately changing a manifest command's `kind` to a value the handler does not emit makes the new test fail (verify by a temporary local edit during development).
- [x] #4 The full test suite (`bun test`) passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read src/core/manifest.ts's per-command `kind:` field and every src/commands/*.ts handler's actual emitted `kind:` literal (incl. link.ts's reportRenderable('link.result'/'unlink.result', ...) call sites). 2. Add a new golden-table cross-check test in test/help.test.ts, mirroring the existing exitCodes golden at :62-94: a Record<string,string> transcribed independently from each handler's kind literal, pinned via Object.keys(golden).sort() === manifestCommandNames().sort(), then per-command expect({[name]: command.kind}).toEqual({[name]: golden[name]}). 3. Run bun test to confirm green. 4. Prove the mutation-killer: temporarily edit src/core/manifest.ts (check's kind -> 'check.reportXXX'), rerun bun test to see the new test fail with a named diff, then git checkout -- src/core/manifest.ts to revert. 5. Run full bun test + bun run typecheck + biome check on test/help.test.ts. 6. Finalize in Backlog and commit only test/help.test.ts + the task file.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added 'each command's declared kind matches the live handler's emitted kind (golden cross-check)' test to test/help.test.ts, right after the exitCodes golden test. Golden table (Record<string,string>, 20 entries) transcribed independently from each handler's own kind: literal: init.ts, new.ts, validate.ts, check.ts, replace.ts, rename.ts, supersede.ts, link.ts (reportRenderable call sites for link.result/unlink.result), sync.ts, tasks.ts, orphans.ts, schema.ts, scaffold.ts, graph.ts, query.ts, context.ts, instructions.ts, agents.ts, help.ts. Pinned via Object.keys(golden).sort() === [...manifestCommandNames()].sort() so a newly added command without a kind mapping fails. Verification: bun test test/help.test.ts -> 29 pass/0 fail. Mutation-killer proof: temporarily edited src/core/manifest.ts's check command kind to 'check.reportXXX' -> new test failed with a clear per-command diff ({check: 'check.report'} vs {check: 'check.reportXXX'}), 28 pass/1 fail; then git checkout -- src/core/manifest.ts to revert (confirmed via git diff: no changes to manifest.ts). Full bun test: 1918 pass/0 fail. bun run typecheck: clean (tsc --noEmit, no output). bunx biome check test/help.test.ts: 'Checked 1 file in 10ms. No fixes applied.' Final diff scoped to test/help.test.ts only (plus this backlog task file).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the last unguarded manifest drift vector: added a golden cross-check test in test/help.test.ts (mirroring the existing exitCodes golden) that pins each manifest command's declared kind against an independently-transcribed table of each handler's own kind: literal, keyed by command name and pinned to manifestCommandNames() so a new command without a kind mapping fails. Proved the mutation-killer by temporarily changing manifest.ts check's kind to an unemitted value, observing the new test fail with a clear per-command diff, then reverting (git diff confirms manifest.ts unmodified in the final diff). Verified: bun test test/help.test.ts 29 pass/0 fail; full bun test 1918 pass/0 fail; bun run typecheck clean; bunx biome check test/help.test.ts clean. Final diff: test/help.test.ts only.
<!-- SECTION:FINAL_SUMMARY:END -->
