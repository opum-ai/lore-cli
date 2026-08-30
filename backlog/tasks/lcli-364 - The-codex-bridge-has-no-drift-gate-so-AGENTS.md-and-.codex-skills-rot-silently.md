---
id: LCLI-364
title: >-
  The codex bridge has no drift gate, so AGENTS.md and .codex/skills rot
  silently
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-30 00:19'
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
- [ ] #1 Both bridges are covered by a drift check that fails when either the codex SKILL.md or the AGENTS.md managed block diverges from its generator, and the check names which artifact drifted
- [ ] #2 The check runs in CI on every PR, so a codex-bridge change that is not regenerated fails before merge
- [ ] #3 The check is proven by a negative control: a deliberate one-line edit to the AGENTS.md managed block makes it fail and name that file, and the check returns to passing once reverted
- [ ] #4 The check does not regenerate in place and leaves no untracked files behind — verified by a clean 'git status' after a passing run
<!-- AC:END -->
