---
id: LORE-37
title: lore instructions (layered agent guides)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:27'
updated_date: '2026-07-07 17:52'
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

Out of scope (separate task): LORE-36 (generated SKILL.md + CLAUDE.md nudge)
depends on this and is not started -- it can reuse core/instructions.ts's
OVERVIEW content once built.
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
