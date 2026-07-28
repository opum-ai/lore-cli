---
id: LORE-129
title: >-
  `lore agents --check --force` mislabels a stale hand-edited SKILL.md and
  prints a remedy that won't fix it
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 19:34'
labels:
  - codex-review-followup
  - cmd-meta-c
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`planSkill` (src/core/agent-bridge.ts:222-234) returns action `updated` whenever `input.force` is true and the on-disk SKILL.md differs from desired, regardless of whether the caller passed `--check` (a read-only mode that should never claim to have written anything). Because `renderTrailer` (src/commands/agents.ts:167-183) only special-cases the `--force` remedy when some file's action is `protected`, and no file gets that action under `--check --force`, `hasProtected` is false and the trailer falls through to "bridge is out of date — run `lore agents` to regenerate (exit 6)" — a command that will NOT overwrite the protected SKILL.md, since a plain (non-force) run treats a differing file as `protected` again. A user following the printed remedy sees the drift persist and CI stays red.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `lore agents --check --force` against a hand-edited (differing) SKILL.md reports that file's action as `protected` (or another check-safe, non-mutating label), never `updated`, since `--check` performs no writes.
- [x] #2 The trailer text printed by `lore agents --check --force` in this scenario recommends `lore agents --force` (the remedy that actually fixes it), not the plain `lore agents` remedy.
- [x] #3 A new test in test/agents.test.ts covers the `--check --force` combination against a hand-edited SKILL.md, asserting both the reported action and the trailer text, complementing the existing plain `--check` test at lines 217-226.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a check: boolean field to PlanBridgeInput (core/agent-bridge.ts). 2. In planSkill, only report action 'updated' when force && !check; otherwise 'protected' for a differing SKILL.md (so --check never claims a write it doesn't perform, regardless of --force). 3. Pass the real check flag through from runAgents (commands/agents.ts) into planBridge alongside force. 4. renderTrailer already special-cases hasProtected to print the --force remedy under --check, so once planSkill reports protected under --check --force, the existing trailer logic automatically prints the correct '--force' remedy with no further change needed there. 5. Update existing planBridge() test call sites to pass check, add a new pure planBridge test for --check --force, and a new runAgents-level test asserting action=protected, exit 6, no write, and the plain-text trailer recommending 'lore agents --force' (not the inert plain remedy). 6. Verify with bun test + bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: planSkill (core/agent-bridge.ts) decided action solely from input.force, blind to --check, so --check --force against a differing SKILL.md reported 'updated' even though --check performs no write; hasProtected was then false, so renderTrailer (commands/agents.ts) fell through to the plain 'lore agents' remedy, which — being non-forced — leaves the file protected again (permanently red CI). Fix: added check: boolean to PlanBridgeInput; planSkill now only reports 'updated' when force && !check, else 'protected'. runAgents now passes its real check flag into planBridge alongside force. renderTrailer needed no change: it already special-cases hasProtected to print the --force remedy under --check; it just never used to see hasProtected=true in this combo. Verification: bun test -> 1773 pass, 0 fail (5013 expect() calls), including 2 new regression tests (a pure planBridge --check--force test and a runAgents-level test asserting action=protected, exit 6, zero bytes written, and plain-text trailer containing 'lore agents --force' and NOT the inert 'run `lore agents` to regenerate' text). bun run typecheck -> clean (tsc --noEmit, no errors). No docs/ files touched, so lore check not required.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed planSkill (src/core/agent-bridge.ts) to only report SKILL.md action 'updated' when force && !check — a --check run never writes, so it must never claim a write. Added check to PlanBridgeInput; runAgents (src/commands/agents.ts) now passes its real --check flag through to planBridge alongside --force. renderTrailer's existing hasProtected special-case now correctly fires under --check --force, printing the 'lore agents --force' remedy instead of the inert plain one. Added regression tests in test/agents.test.ts at both the pure planBridge layer and the runAgents/CLI layer (action, exit code, no-write, and plain-text trailer). Verified: bun test = 1773 pass/0 fail (5013 expect() calls); bun run typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
