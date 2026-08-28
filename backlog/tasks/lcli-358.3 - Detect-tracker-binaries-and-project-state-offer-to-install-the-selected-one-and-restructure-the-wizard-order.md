---
id: LCLI-358.3
title: >-
  Detect tracker binaries and project state, offer to install the selected one,
  and restructure the wizard order
status: Done
assignee:
  - '@claude'
created_date: '2026-08-28 21:47'
updated_date: '2026-08-28 23:29'
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
- [x] #1 Before the tracker question, init detects which of quest/backlog/jira are on PATH and which are already initialized in this repository, and shows that state with the choices
- [x] #2 Choosing a tracker whose binary is missing offers to install its package, verifies the install, and re-probes; declining exits with the install command
- [x] #3 Returning to the tracker question from a declined setup is bounded and cannot loop indefinitely
- [x] #4 `--tracker`, plus flags for install-or-not, reproduce every branch without prompting
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New src/adapters/tracker-environment.ts: for each of quest/backlog/jira report { backend, binary, package, installed, initialized }. installed is Bun.which; initialized is the repository marker — .quest/workspace.toml for quest, backlog/config.yml for backlog (a bare backlog/ directory is not a project, per LCLI-358.5), and undefined for jira, whose readiness is credential-profile state that LCLI-358.4 owns. Injectable as InitOptions.trackerEnvironment.
2. Same module owns the installer seam: installTrackerPackage(backend) shells `npm install -g <package>` and re-detects, returning whether the binary is now present. Injectable as InitOptions.installTracker. This is a real system-modifying action, so it never runs without either an explicit wizard confirmation or an explicit flag.
3. Wizard order: git preflight (LCLI-358.1) -> detect -> write a one-line-per-backend environment summary to stderr -> ask the tracker question -> resolve the selected backend's binary.
4. Missing binary handling, bounded to two attempts total so it cannot spin: offer to install; on accept, install, re-detect, and continue when the binary appears or fail with a classified diagnostic when it does not; on decline, offer once to choose a different tracker instead, and if that is also declined exit with the exact install command.
5. Flags for the non-interactive equivalents: --install-tracker installs a missing binary for the selected backend; --no-install-tracker is the explicit opt-out. Register both in the CLI manifest.
6. InitResult gains a trackerEnvironment field so a --json consumer sees what init detected and whether it installed anything.
7. Tests: detection of each marker; the summary reaching stderr before the question; accept-install; decline-install-then-switch; decline-both exits with the install command; the loop bound; both new flags; and that no install ever runs without a confirmation or a flag.
8. Update docs/reference/cli-surface.md and ADR-0017's amendment; run typecheck, lint, the full suite, and lore check.

Out of scope, owned elsewhere: what happens when the selected backend is installed but NOT initialized. Quest's own init is LCLI-358.6 (blocked on QCLI-136); Backlog's and Jira's escape hatches are LCLI-358.4 and the step-7 flow. This task detects and reports that state; it does not act on it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification (2026-08-28).

Unit: bun test 2718 pass / 0 fail / 1 skip; 10 new tests. lint, typecheck, and lore check all exit 0.

AC#1 — detection and the summary. New src/adapters/tracker-environment.ts reports { backend, binary, package, installed, initialized } for quest/backlog/jira. installed is a PATH lookup; initialized is one marker file — .quest/workspace.toml and backlog/config.yml. A bare backlog/ directory is deliberately NOT a project, and a test asserts both halves of that. Jira's initialized is undefined rather than false: its readiness is credential-profile state with no repository-local marker, so claiming false would assert something the module cannot know (LCLI-358.4 answers it). Verified live under a pty — the summary prints after the git question and before the tracker question:
  Tracker backends found on this machine:
    quest: installed — not initialized in this repository
    backlog: installed — not initialized in this repository
    jira: installed — readiness is credential-based; checked when selected

AC#2 — install offer. Choosing a backend whose binary is missing offers its exact `npm install -g <package>` command, runs it, and re-detects. The re-detection is not ceremony: npm can succeed while the binary stays off PATH (a global prefix outside PATH), and that case gets its own not_found diagnostic pointing at `npm prefix -g` rather than looking like a declined offer. Declining offers one switch to another backend; declining that exits with the install command.

AC#3 — the bound. MAX_TRACKER_ATTEMPTS = 2. A loop whose exit depends only on the operator eventually answering differently is one an automated or confused caller never escapes, so the bound is in the code. Tested adversarially: a prompter that always picks the uninstalled backend, always declines the install, and always accepts the switch still terminates after exactly two tracker questions with a not_found error.

AC#4 — flags. --install-tracker installs without prompting; --no-install-tracker never installs; the pair is mutually exclusive; both are registered in the CLI manifest and both skip the wizard per ADR-0017's any-flag rule (unlike --allow-no-git, these answer a wizard question). A test asserts the invariant that matters most: a bare non-interactive run with a missing binary installs nothing at all. npm is only ever run on an explicit confirmation or an explicit flag.

Detection also runs on the non-interactive path, so a --json consumer sees the same facts the wizard shows a human. Three PATH lookups and three existsSync calls — no subprocess, so the pre-LORE-260 'a bare init spawns no tracker' guarantee is intact.

Scope note: what happens when the selected backend is installed but NOT initialized is deliberately untouched here. Quest's own init is LCLI-358.6 (blocked on QCLI-136); Backlog's and Jira's escape hatches are LCLI-358.4 and the step-7 flow. This task detects and reports that state; it does not act on it.

Docs: docs/reference/cli-surface.md (flags, output fields, and a new paragraph on the detection step) and an ADR-0017 amendment recording that the install offer is a new class of wizard question — the others choose what lore writes in the repository, this one changes the machine — and the reason the retry is bounded.

Not verified here: the docker e2e suite. Two cases added asserting the detection shape and the no-install invariant; bash -n passes and both jq filters were run against the real CLI locally. The container could not run — docker info exits 1 on this host.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
lore init now asks the tracker question with the environment in view, and can install the backend the operator picks.

New src/adapters/tracker-environment.ts detects all three backends cheaply and locally — PATH for the binary, one marker file for repository setup (.quest/workspace.toml, backlog/config.yml; a bare backlog/ directory is not a project). Jira reports undefined rather than false because its readiness has no repository-local marker. The wizard prints one line per backend to stderr before the question; the same detection appears in the --json result on every run.

Choosing a backend whose binary is missing offers its exact npm install -g command, runs it, and re-detects — npm can succeed while the binary stays off PATH, and that gets its own diagnostic. Declining offers one switch to another backend; declining that exits with the install command. The retry is bounded at two passes in code, not by the operator eventually answering differently. --install-tracker and --no-install-tracker are the prompt-free equivalents, and nothing is ever installed without one of them or an explicit confirmation.

Verified: bun test 2718 pass / 0 fail (10 new, including an adversarial prompter that always declines and still terminates); lint, typecheck, and lore check exit 0; the summary and its ordering confirmed live under a pty. Two docker/e2e cases added with their jq filters run against the real CLI; the container could not run on this host.

Untouched by design: what happens when a selected backend is installed but not initialized — LCLI-358.4, .6, and the step-7 flow own that.
<!-- SECTION:FINAL_SUMMARY:END -->
