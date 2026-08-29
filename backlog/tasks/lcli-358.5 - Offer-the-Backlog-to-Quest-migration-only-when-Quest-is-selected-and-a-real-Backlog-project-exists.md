---
id: LCLI-358.5
title: >-
  Offer the Backlog-to-Quest migration only when Quest is selected and a real
  Backlog project exists
status: Done
assignee:
  - '@claude'
created_date: '2026-08-28 21:47'
updated_date: '2026-08-29 05:37'
labels:
  - init
  - tracker
  - migration
  - quest
dependencies: []
parent_task_id: LCLI-358
ordinal: 484000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The migration gate is wrong in four ways, all confirmed 2026-08-28.

1. **It hijacks the tracker question.** src/commands/init.ts's wizard replaces the tracker prompt with a migrate/pin choice whenever resolveTrackerSelection returns `legacy-backlog`, so jira and none are unreachable in a repository that happens to have a `backlog/` directory.
2. **A bare directory counts as a Backlog project.** src/tracker-selection.ts:78 checks only that `backlog/` is a real directory — no Backlog.md project marker.
3. **Legacy + quest without migration is a hard error.** You cannot select Quest and leave the Backlog tasks in place.
4. **An explicit backlog config is a dead end, and its escape hatch orphans data.** With `backend = "backlog"` already written, `lore init --tracker quest --migrate-backlog` is refused with `--migrate-backlog requires --tracker quest in a legacy zero-config Backlog bundle` — the flag it demands was passed. Meanwhile bare `--tracker quest` succeeds silently and orphans every Backlog task. The guard only covers zero-config bundles and its bypass is one flag away.

Offer migration only after the tracker question settles on Quest and a real Backlog project is present, with three explicit answers: migrate, keep Backlog in place, or pin Backlog as the tracker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The tracker question is always asked; a legacy Backlog bundle never removes jira or none from the choices
- [x] #2 Migration is offered only when the selected tracker is quest and a real Backlog.md project (not a bare directory) exists
- [x] #3 Selecting Quest over an explicitly configured Backlog bundle is reachable, and requires an explicit answer about the existing tasks rather than silently orphaning them
- [x] #4 The --migrate-backlog refusal message names the actual unmet condition
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `src/tracker-selection.ts`: the legacy marker becomes `backlog/config.yml` (a real file), matching what `backlog init` writes and what `adapters/tracker-environment.ts` already treats as the marker. A bare `backlog/` directory stops meaning 'this is a Backlog project' and falls through to the quest default. The symlink refusal is kept and extended to the marker file. Export `hasBacklogProject(root)` so init gates on the same fact rather than re-deriving it (AC#2).
2. `src/commands/init.ts` wizard: delete the branch that replaces the tracker question with a migrate/pin choice. The tracker question is now always asked, so jira and none stay reachable in a repository that has Backlog tasks (AC#1).
3. After the tracker answer settles on quest AND a real Backlog project exists, ask a three-answer question — migrate / keep / backlog. `keep` selects Quest and leaves `backlog/` untouched; `backlog` pins Backlog instead. Gated on the project existing, NOT on `source === legacy-backlog`, which is what made an explicitly configured Backlog bundle a dead end (AC#3).
4. Non-interactive equivalent: `--tracker quest` with a real Backlog project present requires either `--migrate-backlog` or a new `--keep-backlog-tasks`. Neither flag is a usage error naming both, so a scripted run can no longer orphan tasks silently — including over an explicit `backend = "backlog"`, which today succeeds without a word (AC#3).
5. Split `assertFlagCombinations`' single `--migrate-backlog` refusal into one message per unmet condition: wrong `--tracker` value names the value passed; a missing Backlog project names `backlog/config.yml`. Drop the `source === legacy-backlog` precondition that refused the exact command its own hint recommended (AC#4).
6. Tests: wizard reaches jira and none over a Backlog bundle; a bare `backlog/` directory is not a project; the three-answer question and each of its outcomes; the non-interactive flag matrix over both legacy and explicit backlog bundles; each refusal message. Run bun test, lint, typecheck, lore check, and drive the wizard live under a pty.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned. Three things worth recording.

**The migration question's own text collided with the test harness.** It ends '…or use Backlog as the tracker?', and `scriptedPrompter` routed any question containing 'tracker' to the tracker answer. The helper now matches 'Backlog.md project' first. A real defect in the fixture, not in the code, but it would have made the new tests silently answer the wrong question.

**`keep` needed no implementation branch, and that is the point.** Selecting Quest and leaving `backlog/` alone is exactly what the code already did — silently. The answer exists so the outcome is something the operator chose rather than something that happened to them; `--keep-backlog-tasks` is its scripted form.

**Tightening the marker moved behavior outside init.** `resolveTrackerSelection` feeds `tracker-persistence.ts` and `adapters/tracker.ts` too, so a repository with a bare `backlog/` directory now resolves to quest everywhere, not just in `lore init`. That surfaced in `test/sync.test.ts`, whose real-git fixture created `backlog/tasks/` with no `config.yml` and relied on the loose interpretation to commit anything. The fixture now writes the marker, which is what a real Backlog project has.

Validation:
- `bun test`: 2752 pass, 0 fail (was 2739). `bun run lint`, `bun run typecheck`, `lore check` all exit 0.
- Live under a pty with `expect(1)`, against a real legacy fixture (`backlog/config.yml` + one task):
  - AC#1 — answered `jira` at the tracker question and reached the jira profile/project prompts; the migration question was never asked. The old code could not offer jira here at all.
  - AC#3 — answered `quest` then `keep`: config is `backend = "quest"` and `backlog/tasks/lcli-1 - x.md` is still on disk. Answered `quest` then `backlog`: config is `backend = "backlog"`.
  - AC#3 scripted — `--tracker quest` over the project exits 6 naming all three ways out; `--keep-backlog-tasks` exits 0 writing quest; the same refusal fires over an explicit `backend = "backlog"`, which previously succeeded in silence.
  - AC#4 — `--tracker backlog --migrate-backlog` names the value passed; `--migrate-backlog` with no project names `backlog/config.yml`; the two opposite flags together are mutually exclusive; `--keep-backlog-tasks` outside a quest selection is refused.
  - AC#2 — in a repository with a bare `backlog/` directory, `--tracker quest` exits 0 with no question and no refusal.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The migration gate was wrong in four ways and now reads the repository instead of the configuration. `hasBacklogProject` in `src/tracker-selection.ts` requires `backlog/config.yml` — the file `backlog init` writes — so a directory that merely shares the name no longer decides the backend. The wizard always asks the tracker question, so jira and none stay reachable in a repository with Backlog tasks; the migration question follows it, only when the answer is quest and a real project exists, and offers three answers: migrate, keep, or use Backlog. `--keep-backlog-tasks` is the scripted 'keep' answer, and a scripted `--tracker quest` over a real project now fails without it rather than orphaning tasks — including over an explicit `backend = "backlog"`, which previously succeeded in silence and could not reach Quest through the command its own error message recommended. The single shared `--migrate-backlog` refusal is split into one message per unmet condition. Verified with `bun test` (2752 pass, 0 fail), clean lint/typecheck/lore check, and live pty runs of the compiled binary covering each wizard answer and each refusal.
<!-- SECTION:FINAL_SUMMARY:END -->
