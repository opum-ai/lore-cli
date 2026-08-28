---
id: LCLI-358.3
title: >-
  Detect tracker binaries and project state, offer to install the selected one,
  and restructure the wizard order
status: To Do
assignee: []
created_date: '2026-08-28 21:47'
labels:
  - init
  - tracker
  - onboarding
dependencies: []
parent_task_id: LCLI-358
ordinal: 482000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The wizard asks which tracker to use before knowing anything about the environment, then never checks the answer is usable.

Detection markers, confirmed 2026-08-28: Quest is `.quest/workspace.toml`; Backlog is a real Backlog.md project under `backlog/` (a bare directory is not enough — see LCLI-358.5); Jira has no local marker and is handled in LCLI-358.4. Binaries: `quest`, `backlog`, `jira`. Packages: `@opum-ai/quest` (public, latest 0.2.9), `backlog.md` (1.50.1), `@salient-ai/jira-cli` (1.0.2).

Order: git (LCLI-358.1) -> detect binaries -> detect project state -> ask the tracker with Quest as default -> install the selected tracker's binary if missing -> hand off to LCLI-358.4/.6 for the selected tracker's initialization.

Step 7 loops: a user who declines to set up Backlog or Jira may switch to Quest, which re-asks the tracker question. Bound the loop so it cannot spin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before the tracker question, init detects which of quest/backlog/jira are on PATH and which are already initialized in this repository, and shows that state with the choices
- [ ] #2 Choosing a tracker whose binary is missing offers to install its package, verifies the install, and re-probes; declining exits with the install command
- [ ] #3 Returning to the tracker question from a declined setup is bounded and cannot loop indefinitely
- [ ] #4 `--tracker`, plus flags for install-or-not, reproduce every branch without prompting
<!-- AC:END -->
