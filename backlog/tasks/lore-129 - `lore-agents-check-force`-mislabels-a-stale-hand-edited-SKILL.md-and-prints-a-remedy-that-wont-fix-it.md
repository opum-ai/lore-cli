---
id: LORE-129
title: >-
  `lore agents --check --force` mislabels a stale hand-edited SKILL.md and
  prints a remedy that won't fix it
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 `lore agents --check --force` against a hand-edited (differing) SKILL.md reports that file's action as `protected` (or another check-safe, non-mutating label), never `updated`, since `--check` performs no writes.
- [ ] #2 The trailer text printed by `lore agents --check --force` in this scenario recommends `lore agents --force` (the remedy that actually fixes it), not the plain `lore agents` remedy.
- [ ] #3 A new test in test/agents.test.ts covers the `--check --force` combination against a hand-edited SKILL.md, asserting both the reported action and the trailer text, complementing the existing plain `--check` test at lines 217-226.
<!-- AC:END -->
