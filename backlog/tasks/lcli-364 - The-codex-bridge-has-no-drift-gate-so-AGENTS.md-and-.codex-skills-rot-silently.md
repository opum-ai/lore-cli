---
id: LCLI-364
title: >-
  The codex bridge has no drift gate, so AGENTS.md and .codex/skills rot
  silently
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-30 00:19'
updated_date: '2026-08-30 00:38'
labels:
  - agents
  - codex
  - ci
  - gate
dependencies: []
priority: medium
type: bug
ordinal: 491000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
'lore agents --check' gates only the CLAUDE bridge — .claude/skills/lore/SKILL.md and the CLAUDE.md nudge block. Nothing gates the codex bridge: 'grep -rn codex .github/workflows/*.yml' returns no match, and 'lore agents' does not write or check .codex/skills/lore/SKILL.md or the AGENTS.md nudge at all. Regenerating them requires 'lore init --codex', which nobody runs in CI.

The consequence is not theoretical. On 2026-08-29 AGENTS.md's managed lore:agents block was found DRIFTED from buildCodexNudgeBody(): the generator emits the topic list (linking, sync, check, validation, workspace) and AGENTS.md carried it without 'workspace', so a Codex agent reading its own entry document would never learn 'lore instructions workspace' exists. CLAUDE.md was correct, because its side has a gate. Fixed under LCLI-362, but the fix was found by an ad-hoc script written by hand — exactly the discovery path a gate exists to replace.

This is the repository's own gate-shape problem applied to itself: one generated artifact is enumerated and checked, its twin is not, and the green check on the first reads as coverage of both.

Two candidate designs, decide explicitly:
(a) extend 'lore agents' so --check (and --force) cover BOTH bridges, which makes the existing CI job cover the codex side for free;
(b) add a separate codex check mode and a second CI step.
(a) is likelier right — one command that means 'the bridges are current' is harder to half-run than two — but it changes 'lore agents' from a Claude-specific command to a bridge-general one, which is a documented-surface change needing a manifest and cli-surface update.

Note a trap found while fixing the drift: 'lore init --yes --codex' in an already-initialized repository also creates .lore/profile.toml, .lore/.gitignore and .lore/templates/.gitkeep. The generated profile.toml is fully commented out and inert today, but the profile loader reads it, so a check implemented by shelling out to 'lore init --codex' would leave behind a file that could later change validation behaviour. A check must compute the expected bytes and compare, never regenerate in place.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both bridges are covered by a drift check that fails when either the codex SKILL.md or the AGENTS.md managed block diverges from its generator, and the check names which artifact drifted
- [x] #2 The check runs in CI on every PR, so a codex-bridge change that is not regenerated fails before merge
- [x] #3 The check is proven by a negative control: a deliberate one-line edit to the AGENTS.md managed block makes it fail and name that file, and the check returns to passing once reverted
- [x] #4 The check does not regenerate in place and leaves no untracked files behind — verified by a clean 'git status' after a passing run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed and verified 2026-08-29.

Design chosen: option (a) — 'lore agents' now covers BOTH bridges, so the existing CI job gates the codex side for free rather than needing a second command nobody remembers to run. planCodexBridge already returned the same BridgePlan shape as planBridge, so applyAgentsBridge merges the two plans and the write loop, symlink sweep, and result payload all work unchanged.

THE CONDITIONAL IS THE DESIGN, not an optimization, and it is the part to preserve. hasCodexBridge() arms the codex half only when '.codex/skills/lore/SKILL.md' EXISTS or AGENTS.md carries the lore:agents block. Checking unconditionally would report 'created' -- drift -- for every Claude-only repository and turn the gate into one everybody disables; a gate that must be switched off protects nothing. 'lore init --codex' is what opts a repository in. Either artifact alone arms it, because an AGENTS.md block whose SKILL.md was deleted is exactly the drift worth catching, and so is the reverse.

A REAL BUG WAS CAUGHT BY THE TEST I ALMOST DID NOT WRITE. readFileIfPresent signals absence with 'undefined', not 'null'. My first hasCodexBridge used '!== null', which is TRUE for a missing file -- so it armed the codex half in every Claude-only repository and CREATED the very .codex/ tree whose absence was supposed to disarm it. The test that caught it is 'a Claude-only repository is untouched and stays at exit 0', which asserts the NEGATIVE case. Had I only tested that drift is detected, every assertion would have passed and the regression would have shipped. The comment in hasCodexBridge names the trap so it is not reintroduced.

AC#1 -- both bridges covered; the result payload lists each file with its action, so a failing --check names the artifact that drifted.
AC#2 -- runs in CI on every PR with no workflow change: the existing 'lore agents --check' step now covers all four files.
AC#3 -- NEGATIVE CONTROL RUN IN THIS REPOSITORY, because a gate never observed failing is not known to work. Baseline 'lore agents --check' exit 0; removed the 'workspace' topic from AGENTS.md's managed block; re-ran -> EXIT 6, and the JSON named AGENTS.md as 'updated' while all three other bridge files stayed 'unchanged' -- so it names the offender rather than just going red. Restored the file -> exit 0 again.
AC#4 -- 'git status --short' after the passing run shows only modified tracked files and NO untracked entries. The check compares computed bytes; it never shells out to 'lore init --codex', which would leave .lore/profile.toml, .lore/.gitignore and .lore/templates/.gitkeep behind (the trap recorded on this task).

Documented surface updated to match: the manifest/help summary is now 'Regenerate the agent bridges (SKILL.md + the CLAUDE.md/AGENTS.md nudge)', and docs/reference/cli-surface.md's agents section states the conditional and why it exists. .claude/skills/lore/SKILL.md regenerated through 'lore agents', never by hand.

Validation: bun test 2764 pass / 0 fail / 1 skip (42/42 in agents.test.ts, 7 new). typecheck 0, lint 0, lore check 0, lore validate --strict 0, lore agents --check 0 -- each exit code taken without a pipe.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-30 00:38
---
CORRECTION 2026-08-29, before this is read as clean: the FIRST version of this fix had a real defect, and the docker E2E harness caught it — no unit test did.

WHAT WENT WRONG. I added codex coverage inside applyAgentsBridge unconditionally. That function is shared with 'lore init --claude', which is a SCOPED request — set up the Claude bridge — and whose other half is 'lore init --codex' with its own applyCodexBridge. So '--claude' began reporting and regenerating files the user never asked about. E2E case 'LCLI-298 AC3: lore init --claude creates the Claude Code bridge' pins that reported file list to exactly ['.claude/skills/lore/SKILL.md', 'CLAUDE.md'] and went red: 352 passed, 1 failed.

WHY MY OWN TESTS MISSED IT. All seven tests I wrote asked whether the gate FIRES — does drift produce exit 6, does a Claude-only repo stay at 0. None asked whether the change stayed inside the command that wanted it. Testing that a feature works is not the same as testing that it did not reach somewhere it should not.

THE FIX. Codex coverage is now opt-in through ApplyAgentsOptions.includeCodex, set ONLY by runAgents. 'lore agents' means 'the bridges are current' and wants both; 'lore init --claude' does not, and now gets exactly its two files again. A unit test asserts BOTH directions — applyAgentsBridge's default reports the two Claude files, and 'lore agents --check' reports four — so this is no longer held only by the E2E. docs/reference/cli-surface.md states the distinction explicitly.

THIS IS THE SECOND BUG THE NEGATIVE CASE CAUGHT IN THIS ONE CHANGE. The first was the undefined-vs-null slip in hasCodexBridge, caught by 'a Claude-only repository stays at exit 0'. Both were cases of the change reaching further than intended, and in both the assertions about the intended behaviour all passed. Worth remembering when extending a shared helper: the risk is not that the new path is wrong, it is that an existing caller silently acquires it.
---
<!-- COMMENTS:END -->
