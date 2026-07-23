---
id: LORE-209
title: >-
  Correct the inaccurate comment and strengthen rename's "never constructs a
  Backlog adapter" test
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-rename-supersede
  - codex-review-followup
  - test-quality
dependencies: []
priority: low
type: chore
ordinal: 311000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The test "renaming an unlinked concept never constructs a Backlog adapter at all" at `test/rename.test.ts:1107-1126` carries a comment (lines 1111-1113) that justifies its claim with a false mechanism: it says constructing the real default adapter "would either hang or throw in a sandboxed test run." That is not true. `defaultAdapter(root)` (`src/commands/link.ts:530`) returns `createBacklogAdapter(bunBacklogSpawn(undefined, root))`; `createBacklogAdapter` (`src/adapters/backlog.ts:690`) only allocates closures, and `bunBacklogSpawn` (`src/adapters/backlog.ts:235`) only returns an async function — `Bun.spawn` runs at `src/adapters/backlog.ts:237` exclusively when a method (`probe`/`listTasks`/etc.) is invoked. Construction is therefore inert; it neither hangs nor throws.

Consequence: the test's assertion (an unlinked rename succeeds with empty `backRefs`) proves only that no Backlog method is *invoked* (no subprocess spawned) — it does NOT prove the adapter is never *constructed*, and its stated reasoning is wrong. In production the default adapter is in fact only constructed inside the linked/non-dry-run branch (`src/commands/rename.ts:206-207`), so the title's claim is true of the code, but the test does not actually enforce it.

Provenance: Codex second-opinion review (backlog doc-2), Low-severity cluster `cmd-rename-supersede`. Low live impact — a test-hygiene/accuracy issue, no production bug.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The comment at test/rename.test.ts:1107-1126 no longer claims that merely constructing the default Backlog adapter would "hang or throw"; it accurately states that construction (defaultAdapter -> createBacklogAdapter(bunBacklogSpawn(...))) is lazy and that an unlinked rename never reaches the Backlog branch (src/commands/rename.ts:206-207), so no subprocess is spawned.
- [ ] #2 The test enforces its title rather than merely asserting it in prose: it fails if src/commands/rename.ts were changed to construct or invoke the default Backlog adapter during an unlinked rename — e.g. via a spy on defaultAdapter/bunBacklogSpawn asserting zero calls, or an injected spawn/adapter seam that throws if touched, so an accidental unconditional construction/invocation is caught.
- [ ] #3 `bun test test/rename.test.ts` passes with the updated test.
<!-- AC:END -->
