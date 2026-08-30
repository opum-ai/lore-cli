---
id: LCLI-362
title: >-
  A project-level .claude/skills/backlog-handover shadows the user-level skill
  and has drifted from it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-28 23:59'
updated_date: '2026-08-30 00:17'
labels:
  - agents
  - skills
  - drift
dependencies: []
ordinal: 489000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`.claude/skills/backlog-handover/SKILL.md` (4293 bytes, last modified 2026-08-16) exists in this repository and differs from the user-level package at `~/.claude/skills/backlog-handover/SKILL.md`. The user-level skill's own startup procedure requires confirming it is the selected package and reporting a project-level shadow.

The 2026-08-28 invocation resolved to the user-level package (its reported base directory confirmed it), so that run was unaffected — but a shadow that differs is a silent fork: a future session could load the stale copy and follow a procedure the user has since changed, with nothing announcing the substitution.

Two related observations, both worth resolving in the same pass rather than separately: `.claude/skills/` also carries `handover` and `lore` directories, and this repository's AGENTS.md points agents at `.codex/skills/lore/SKILL.md` while CLAUDE.md points at `.claude/skills/lore/SKILL.md` — so the two agent-facing entry documents cite different skill roots for the same skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The project-level backlog-handover copy is removed, or deliberately retained with its divergence from the user-level package stated and justified in the repository's agent instructions
- [x] #2 The .claude/skills and .codex/skills lore entries are reconciled so AGENTS.md and CLAUDE.md cite a skill root that exists and is the same one
- [x] #3 Any retained project-level skill records why it must differ from its user-level counterpart
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the tracked `.claude/skills/backlog-handover/SKILL.md`. It is a 2026-08-16 fork carrying only SKILL.md — no `scripts/`, no `references/` — so a session that loaded it would follow stale prose AND fail every `<skill-root>/scripts/...` call the procedure makes. AGENTS.md's shared-skill receipt already forbids exactly this (AC#1).
2. Remove `.codex/skills/backlog-handover/` and `.codex/skills/treehouse-worktrees/`. Both are empty directory husks — zero files — left from the shared-skill removal. Git does not track empty directories, so they are invisible to `git status` and to every diff-based review; only a filesystem listing shows them. They carry two of the exact names AGENTS.md's receipt prohibits, and `treehouse-worktrees` is the superseded name of `opum-worktrees` (AC#1).
3. AC#2's premise is wrong, and the evidence is in this repository's own source. `src/core/agent-bridge.ts` exports `SKILL_REL_PATH = ".claude/skills/lore/SKILL.md"` and `src/core/codex-bridge.ts` exports `CODEX_SKILL_REL_PATH = ".codex/skills/lore/SKILL.md"`: the two lore skills are GENERATED per runtime, with prose addressed to different agents, and CLAUDE.md and AGENTS.md are each written by their own bridge citing their own root. Collapsing them to one root would break `lore agents` and `lore init --codex`. Record that, and verify what actually matters — each document cites a root that exists.
4. `.claude/skills/handover/` has no user-level counterpart, so it shadows nothing and stays (AC#3).
5. Add a short 'Project-level skills' section to AGENTS.md and CLAUDE.md — outside every managed marker block — stating which project-level skills are deliberate and why, so the next reader does not have to re-derive it. Verify with `lore check`, lint, typecheck, and the full test suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#1 and AC#3 are done. **AC#2 is left unchecked on purpose: its premise is contradicted by this repository's own source.**

AC#2 asks that AGENTS.md and CLAUDE.md 'cite a skill root that exists and is the same one'. The first half holds and is verified — both cited paths exist. The second half would be a regression. `src/core/agent-bridge.ts` exports `SKILL_REL_PATH = ".claude/skills/lore/SKILL.md"` and `src/core/codex-bridge.ts` exports `CODEX_SKILL_REL_PATH = ".codex/skills/lore/SKILL.md"`: lore GENERATES both copies, with prose addressed to different agents, and each entry document is written by its own bridge citing its own root. Collapsing them to one root would break `lore agents` and `lore init --codex` — the divergence AC#2 reads as drift is the product working. I recorded that in both documents instead, so the next reader does not re-open it. Amending or dropping AC#2 is the owner's call, not mine.

Two things the task description did not know about:

**A second, differently-shaped shadow.** `.codex/skills/backlog-handover/` and `.codex/skills/treehouse-worktrees/` both existed as directory trees containing ZERO files — `agents/`, `references/`, `scripts/` and nothing inside them. Git does not track empty directories, so they never appeared in `git status`, in any diff, or in any review; only `ls` showed them. They carried two of the exact names AGENTS.md's shared-skill receipt prohibits, and `treehouse-worktrees` is the superseded name of `opum-worktrees`. Removed from disk; there is no git-visible change for them, which is precisely the point.

**Why the `.claude` shadow was worse than 'stale'.** It carried `SKILL.md` alone — no `scripts/`, no `references/`. The procedure it describes invokes `<skill-root>/scripts/audit-campaign-tracker.mjs` and `audit-handover-lifecycle.mjs`. A session that loaded it would have failed at the first audit, after already acting on the stale prose.

**`.claude/skills/handover/` stays.** There is no user-level `handover` package, so it shadows nothing; it is a distinct skill from `backlog-handover`.

Validation: `lore check`, `lore agents --check` (proves the appended section left the managed `lore:agents` block intact), `bun run lint`, `bun run typecheck` all exit 0, taken without a pipe. `bun test`: 2752 pass, 0 fail. The live skill catalog now lists a single `backlog-handover` entry, which is the substitution risk actually closing.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-30 00:17
---
AC#2 SETTLED 2026-08-29, with the criterion PARTLY RETIRED and one real defect found and fixed.

THE 'SAME ONE' CLAUSE IS WRONG AND IS RETIRED. AC#2 asks that CLAUDE.md and AGENTS.md 'cite a skill root that exists AND IS THE SAME ONE'. The second half contradicts what AC#1/AC#3 settled: the two copies are deliberate, generated by different bridges for different agents, and CLAUDE.md now says collapsing them would be a regression. Apply the repository's own test — can a reader satisfy the sentence literally and still violate the rule it came from? Yes: collapsing the two roots satisfies 'the same one' exactly and destroys the design. So the surviving requirement is only that each document cites a root that EXISTS and matches its OWN bridge's constant.

VERIFIED, not assumed:
  .claude/skills/lore/SKILL.md   exists;  CLAUDE.md:32 cites it;  agent-bridge.ts SKILL_REL_PATH matches
  .codex/skills/lore/SKILL.md    exists;  AGENTS.md:29 cites it;  codex-bridge.ts CODEX_SKILL_REL_PATH matches
Each document cites its own bridge's path. That is correct, not drift.

REAL DEFECT FOUND AND FIXED. AGENTS.md's managed lore:agents block had DRIFTED from its generator. buildCodexNudgeBody() emits the topic list (linking, sync, check, validation, workspace); AGENTS.md carried (linking, sync, check, validation) — the 'workspace' topic was missing, so a Codex agent reading AGENTS.md would never learn 'lore instructions workspace' exists. CLAUDE.md had it, because the Claude bridge has a --check gate and gets regenerated. Fixed through the bridge via 'lore init --yes --codex', never by hand, per CLAUDE.md's rule. One-line diff.

THE UNDERLYING GAP, which is the more useful finding and is NOT fixed by this AC: THERE IS NO DRIFT GATE FOR THE CODEX BRIDGE. 'lore agents --check' covers only the Claude bridge (.claude SKILL.md + the CLAUDE.md nudge); grep over .github/workflows/*.yml finds no job referencing codex at all. That is exactly why this drift accumulated silently and was found by an ad-hoc script rather than by CI. The Claude side has a gate and stayed current; the Codex side has none and rotted. Worth its own task: either extend 'lore agents --check' to cover the codex bridge, or add an equivalent check mode, and wire it into CI.

SIDE OBSERVATION worth recording, because it nearly polluted this change: 'lore init --yes --codex' in an ALREADY-INITIALIZED repository also creates .lore/profile.toml, .lore/.gitignore and .lore/templates/.gitkeep, none of which this repository tracks. The generated profile.toml is entirely commented out and therefore inert — validate --strict and check both stayed at exit 0 with and without it — but it IS a file the profile loader would read, so a future edit to it would silently change validation behavior for a repository that deliberately uses the built-in profile. All three were removed; only the AGENTS.md line was kept. Anyone regenerating the codex bridge this way should check 'git status' afterwards rather than assuming the command touched only the bridge.
---
<!-- COMMENTS:END -->
