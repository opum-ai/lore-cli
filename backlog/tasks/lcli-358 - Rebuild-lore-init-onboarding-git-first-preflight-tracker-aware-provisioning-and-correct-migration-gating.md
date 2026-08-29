---
id: LCLI-358
title: >-
  Rebuild lore init onboarding: git-first preflight, tracker-aware provisioning,
  and correct migration gating
status: To Do
assignee: []
created_date: '2026-08-28 21:46'
updated_date: '2026-08-29 00:04'
labels:
  - init
  - onboarding
  - tracker
  - dx
dependencies: []
references:
  - >-
    Quest version gate is tracked separately in LCLI-356 (exact-match allowlist
    rejects the shipped 0.2.9); cross-repo dependency is opum-ai/quest-cli
    QCLI-136.
documentation:
  - >-
    backlog/docs/doc-26 -
    Backlog-campaign-tracker-—-LCLI-358-lore-init-onboarding-rebuild.md
ordinal: 479000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`lore init` is confusing from its first prompt. Verified live on 2026-08-28 against lore 0.3.4, quest 0.2.9, backlog 1.50.1, and jira-cli 1.0.2:

1. **No git check.** `lore sync` hard-fails without git (`git rev-parse HEAD exited 128: not a git repository`), and `quest init` refuses outright (`Path is not a Git worktree.`). `lore init` never asks.
2. **No tracker binary or project-state check.** The tracker question is asked blind, before anything is known about what is installed or initialized.
3. **The Backlog probe ignores the selected tracker.** src/commands/init.ts:594 constructs the adapter with a hardcoded `backend: "backlog"`, so selecting Quest still warns `no Backlog.md project is initialized in this directory`. Reproduced with a scripted prompter.
4. **The Quest version gate is an exact-match allowlist.** src/adapters/quest.ts:12 pins `["0.2.7", "0.2.8"]`, so the installed 0.2.9 is rejected as `did not return a supported Quest 0.2 version`. src/adapters/backlog.ts already uses a proper `MIN_BACKLOG_VERSION` semver floor.
5. **Migration is offered and refused in the wrong places.** In a legacy bundle the migrate/pin question replaces the tracker question entirely, so jira and none are unreachable. Legacy + `--tracker quest` without `--migrate-backlog` is a hard error. And once `backend = "backlog"` is explicit, `--tracker quest --migrate-backlog` is refused with `--migrate-backlog requires --tracker quest` (which was passed), while bare `--tracker quest` silently switches and orphans the tasks.
6. **The base scaffold is written before the first prompt**, so a declined preflight or a Ctrl-D leaves a half-applied bundle.
7. **Selecting jira produces a broken bundle**: `lore init` never writes `[tracker.jira]`, so the first tracker command throws `tracker.jira configuration is required`.

Approved flow (product owner, 2026-08-28): preflight before any write -> git check with an escape hatch -> detect tracker binaries -> detect per-tracker project state -> ask the tracker (quest default) -> install the selected tracker's binary if missing -> for Quest, ask Quest's own setup questions and run `quest init` directly -> for Backlog or Jira not yet initialized, offer an escape hatch to set it up, or switch to Quest and re-ask.

Cross-repository dependency: driving `quest init` with answers needs QCLI-136 in opum-ai/quest-cli (released 0.2.9 accepts only --agent-instructions/--json/--plain). The two packages release as a pair.

Every new prompt keeps a 1:1 flag, per ADR-0017.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A bare `lore init` on a TTY runs the approved seven-step flow in order, and writes nothing to disk before the preflight completes
- [ ] #2 Every new wizard question has a matching command-line flag, so a non-interactive run reaches the same end state with zero prompts (ADR-0017)
- [ ] #3 Selecting a tracker never emits a diagnostic about a different tracker
- [ ] #4 docker/e2e covers the git-decline, tracker-selection, and not-initialized escape-hatch paths
<!-- AC:END -->
