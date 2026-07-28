---
id: LCLI-37
title: lore instructions (layered agent guides)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - cmd
  - agent-api
milestone: m-5
dependencies: []
documentation:
  - docs/runbooks/agent-onboarding.md
priority: medium
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layered overview to guides, mirroring Backlog.md instructions; the canonical loop read index -> follow story -> lore tasks -> work -> sync -> check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 overview and per-guide output
- [x] #2 Supports --plain and --json
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core/instructions.ts: pure, static InstructionTopic registry (key/title/body)
   for overview + linking/sync/check/validation, grounded in
   docs/runbooks/agent-onboarding.md's canonical loop and the existing
   check-vs-validate split. No bundle load needed (root-independent).
2. commands/instructions.ts: thin command -- parse optional [topic] positional
   (reject unknown flags/extra args as usage errors), look up the topic
   (LoreError not_found w/ valid-topics hint on miss), build a
   Renderable<InstructionsData> (kind: instructions.text; data includes
   topic/title/body + the full topics index for discoverability), emit().
3. Wire into src/cli.ts: import, USAGE text, dispatch switch case.
4. test/instructions.test.ts mirroring test/graph.test.ts's harness: default
   overview, each explicit topic, unknown topic -> exit 3, --json vs --plain
   envelope shape, usage errors on bad flags.
5. Update docs/reference/cli-surface.md's instructions section's example
   topic list to match the shipped set.
6. bun run typecheck / bun test / bun run lint; lore sync && lore check on
   this repo's own docs/ bundle since cli-surface.md changed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented `lore instructions [<topic>]` (cli-surface.md's already-written
spec was previously unimplemented). Files:
- core/instructions.ts: pure, static topic registry (overview, linking, sync,
  check, validation) grounded in docs/runbooks/agent-onboarding.md's canonical
  loop and the existing check-vs-validate command split. No bundle/config
  read needed -- content is root-independent. Overview body's topic index is
  generated from the same array the command emits, so prose and the JSON
  `topics` field can't drift apart.
- commands/instructions.ts: thin command, one optional positional (default
  "overview"), strict arg parsing (unknown flag/extra positional -> usage,
  exit 2), unknown topic -> not_found (exit 3) with a hint listing valid
  keys. kind: instructions.text; data carries topic/title/body plus the full
  topic index for --json discoverability. pretty/plain share one renderer,
  differing only in whether the title heading is painted.
- Wired into cli.ts (import, USAGE line, dispatch case).
- test/instructions.test.ts: registry invariants, topic resolution (default,
  explicit, each detail topic), usage errors, --plain output, and
  router-level wiring tests (`run(["instructions", ...])` through cli.ts).
- Updated cli-surface.md's instructions row: real topic list (was a vague
  "e.g." example) and the usage/exit-2 case in the exit-code cell.

Verification: bun run typecheck clean; full suite 1297/1297 (12 new tests);
bun run lint clean (3 pre-existing infos in unrelated test files, no new
errors/infos); manually exercised every topic + unknown-topic in pretty,
--plain, and --json modes; `lore check` on this repo's own docs/ bundle
still exits 0 after the cli-surface.md edit.

Out of scope (separate task): LCLI-36 (generated SKILL.md + CLAUDE.md nudge)
depends on this and is not started -- it can reuse core/instructions.ts's
OVERVIEW content once built.

/code-review max on PR #39 found 12 CONFIRMED findings, all in the new
guide content (core/instructions.ts) -- the first-pass prose was grounded
in aspirational docs (agent-onboarding.md describes the FULL planned agent
loop, including `lore tasks`, which is LCLI-25, still To Do) rather than
verified against live source. All 12 fixed in commit 9612834:
- linking/overview no longer tell agents to run the nonexistent `lore
  tasks` command; use `backlog task view <id> --plain` instead.
- linking: fixed link-vs-unlink not_found semantics (unlink tolerates a
  missing id, exit 0) and the backlog/ commit claim (only sync commits,
  not link/unlink).
- sync: fixed kind (sync.result, not sync.summary); removed the
  self-contradicting "silently overwritten AND refused exit 4" claim for
  managed-block edits (no denied path exists for that at all).
- check: removed the false claim of a drift/validation error_type split
  within check itself (its report-failure path never throws -- plain
  exit 6, no error envelope); fixed the exit-3 claim (bad path arg, not a
  missing link/anchor target); dropped a nonexistent "token estimates"
  claim (that's lore context/graph).
- validation: fixed quote-safety severities (3 of 4 checks are
  unconditional errors, not warnings), corrected the ADR-0006 citation to
  reflect the LCLI-46 profile.toml-source-of-truth amendment, and added
  the omitted `resource` drift finding category.
- cleanup: refactored commands/instructions.ts's hand-rolled arg parser
  to reuse commands/args.ts's shared parseCommandArgs/usage (5th
  consumer alongside link/unlink/rename/supersede/sync); updated
  args.ts's own header comment (which also, pre-existingly, omitted
  `sync` from its consumer list).

Re-verified after fixes: bun run typecheck clean; full suite 1297/1297;
bun run lint clean (same 3 pre-existing infos); manually re-exercised
every corrected topic; lore check on this repo's own docs/ bundle still
exits 0.

Note for a future session: docs/runbooks/agent-onboarding.md §1 step 3
itself instructs `lore tasks <story> --json` as if it exists today --
same root defect as what this review caught, but in an already-shipped
doc, out of scope for LCLI-37. Flagged to the user; not fixed here
without explicit scope approval.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented lore instructions [<topic>] end-to-end: a pure static topic
registry (core/instructions.ts: overview/linking/sync/check/validation,
grounded in agent-onboarding.md's canonical loop) served by a thin command
(commands/instructions.ts) wired into cli.ts, with kind: instructions.text,
--plain/--json support, exit 3 on an unknown topic (hint lists valid keys),
and exit 2 on bad usage. Updated cli-surface.md's instructions row to match
the shipped topic list. Verified: bun run typecheck clean; full suite
1297/1297 (12 new tests in test/instructions.test.ts); bun run lint clean (3
pre-existing infos, no new errors); manual exercise of every topic across
pretty/--plain/--json; lore check on this repo's own docs/ bundle still
exits 0. Not yet merged -- status stays In Progress until the PR lands.
<!-- SECTION:FINAL_SUMMARY:END -->
