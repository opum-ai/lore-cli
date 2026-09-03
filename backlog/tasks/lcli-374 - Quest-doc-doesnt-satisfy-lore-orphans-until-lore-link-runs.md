---
id: LCLI-374
title: Quest --doc doesn't satisfy lore orphans until lore link runs
status: Done
assignee: []
created_date: '2026-09-02 20:19'
updated_date: '2026-09-03 02:39'
labels: []
dependencies: []
references:
  - >-
    Reported in an issues dump relayed via opum-agent from other agents'
    lore/quest sessions
  - 2026-09-02; independently reproduced against quest 0.3.0
  - opum-cli-e2e TASK-25
modified_files:
  - src/commands/orphans.ts
  - src/adapters/quest.ts
priority: high
type: bug
ordinal: 501000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Quest's task create/edit --doc <path> writes only Quest's own documentation array (src/adapters/quest.ts:282,292); it never touches the Story's tasks: frontmatter or adds a doc:<conceptId> label. Both of those are exclusively written by lore link (src/commands/link.ts:230,271-276). Meanwhile lore orphans (src/commands/orphans.ts:190-205,248-250) computes orphanTasks purely from tasks: frontmatter plus the doc: label -- documentation is never consulted -- so a task with only --doc set reads as a silent orphan until someone remembers to run lore link. lore check does not catch this: it never calls orphans at all (orphans.ts:26-35 documents this as a report, not a gate), so this is a genuine gap, not a documentation oversight to fix elsewhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore orphans consults Quest's documentation field (or an equivalent back-reference) as well as tasks:/doc: label, so a --doc-linked task is not reported as a dangling orphan before lore link runs
- [x] #2 if --doc-only linkage is intentionally treated as incomplete/pending rather than fully-linked, orphans reports it as a distinct category (e.g. pending-link) rather than an indistinguishable dangling orphan
- [x] #3 Re-scoped 2026-09-02 per opum-agent ruling: satisfy AC3 in lore-cli with unit coverage over computeOrphans (a --doc-only task is a pendingLink before lore link; fully linked -- in neither bucket -- after), since lore-cli's own test suite mocks the tracker via fakeAdapter and never drives a real quest subprocess (a real quest 0.3.1 binary happens to be installed on this dev machine, but is not part of this repo's test/CI convention). The full create-via---doc -> lore link integration path, driven against a real quest binary, is filed as a follow-up against opum-cli-e2e (its 400-row qualification harness is the pair's real cross-binary integration surface).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a third, non-error 'pendingLinks' bucket to lore orphans (LCLI-374 AC2): a task is 'linked' (reported nowhere) via forward-ref/doc:-label/owned-ancestor; among unlinked tasks, split by hasDocumentation() into pendingLinks (--doc set, needs lore link) vs orphanTasks (undocumented). 2. Extend OrphansReport with pendingLinks/-Total/-Shown/-Truncated, gated with orphanTasks under --tasks-only/--docs-only (never check.ts -- orphans stays a report, not a gate). 3. Update text rendering (new block + header count) and the all-clear line (withheld when pendingLinks is non-empty). 4. Add regression tests: pendingLinks population, --tasks-only/--docs-only gating, JSON total/shown/truncated, text rendering, all-clear withholding. 5. AC3: unit-test the before/after transition directly; file the real-quest-binary integration path against opum-cli-e2e (recorded on the task).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/commands/orphans.ts: computeOrphans now classifies each unlinked snapshot task into pendingLinks or orphanTasks via hasDocumentation(); OrphansReport/renderReport/allClearLine updated to carry and render the new section under the same --tasks-only/--docs-only gate as orphanTasks. No check.ts changes needed -- check never called orphans (module docstring, unchanged). bun test test/orphans.test.ts: 67/67 pass (6 new). Full bun test: 2792 pass, 1 pre-existing skip, 0 fail. tsc --noEmit clean; biome check: only the pre-existing unrelated agents.ts warning.

AC3 integration follow-up filed and tracked: opum-cli-e2e TASK-25 ('lore orphans: qualify the pendingLinks bucket end-to-end (LCLI-374)'), pushed to opum-cli-e2e's origin/dev at a68e458 -- the real quest+lore --doc -> lore link -> orphans pendingLinks end-to-end path this task's unit coverage does not cover.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
AC2/AC3 closed. lore orphans now reports a third, non-error 'pendingLinks' bucket (src/commands/orphans.ts): a task documented via Quest's --doc but not yet forward-referenced/doc:-labeled/ancestor-owned is neither a false 'fully healthy' (the AC1 bug) nor an indistinguishable orphanTask -- it is its own distinct report, and lore check does not gate on it (unchanged: check never calls orphans). OrphansReport/text-rendering/all-clear-line all updated to carry pendingLinks alongside orphanTasks under the same --tasks-only/--docs-only split. AC3 verified via unit tests over computeOrphans covering the before (pendingLinks)/after (fully linked, in neither bucket) transition, plus JSON field and text-rendering coverage -- the real-quest-binary end-to-end path is filed as a follow-up against opum-cli-e2e rather than faked against a stub, per opum-agent's ruling (recorded on the task and communicated to opum-cli-e2e directly). Verified: bun test test/orphans.test.ts 67/67 pass; full suite 2792 pass/1 pre-existing skip/0 fail; tsc --noEmit clean; biome check unchanged (one pre-existing unrelated warning).
<!-- SECTION:FINAL_SUMMARY:END -->
