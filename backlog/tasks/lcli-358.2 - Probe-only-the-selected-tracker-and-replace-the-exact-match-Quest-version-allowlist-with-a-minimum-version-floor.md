---
id: LCLI-358.2
title: Probe only the tracker that was actually selected
status: Done
assignee:
  - '@claude'
created_date: '2026-08-28 21:46'
updated_date: '2026-08-28 23:00'
labels:
  - init
  - tracker
  - quest
  - bug
dependencies:
  - LCLI-356
parent_task_id: LCLI-358
ordinal: 481000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/commands/init.ts:594's probeBacklogCapability builds the adapter with a hardcoded `backend: "backlog"`, with a comment declaring this intentional even when the selected backend is Jira. Reproduced with a scripted prompter on 2026-08-28: choosing Quest still prints

    warning: backlog coupling unavailable: The `backlog` binary supports --json, but no Backlog.md project is initialized in this directory; run `backlog init` to initialize one.

The user selected Quest and is told Backlog is broken. The same path fires non-interactively through finishNonInteractive's shouldCheckBacklog, which gates on `parsed.tracker !== "none"` and then probes Backlog regardless.

The Quest version-gate half of this problem is tracked separately in LCLI-356 (the exact-match SUPPORTED_QUEST_VERSIONS allowlist rejecting the shipped 0.2.9), which also covers the late-gate ordering. This subtask is only the wrong-tracker probe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The init capability probe uses the tracker actually selected for this bundle
- [x] #2 No other tracker's binary is spawned, and no other tracker's diagnostic is emitted, for a given selection
- [x] #3 Selecting none runs no tracker probe at all
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace InitBacklogCheck with InitTrackerCheck { checked, backend, capable, version?, warning? } on a new InitResult.trackerCheck field. Keep the existing `backlog` field, marked @deprecated, populated ONLY when the selected backend is backlog — its exact historical meaning — so no consumer of the documented JSON contract breaks while the general case moves to the new field. A later task removes it.
2. Replace probeBacklogCapability with probeTrackerCapability(options, backend, warnings): construct the adapter INSIDE the try, because createTrackerAdapter itself throws for jira with no [tracker.jira] configuration, and that belongs in the advisory warning rather than as an uncaught throw. Warning text names the selected backend instead of hardcoding 'backlog coupling unavailable'.
3. Resolve the probed backend from the actual selection: the wizard's answer interactively; parsed.tracker ?? priorSelection().backend non-interactively. Backend 'none' probes nothing.
4. Add --check-tracker / --no-tracker as the accurate spellings, keeping --check-backlog / --no-backlog as aliases (the same pattern --claude/--agents already uses). Register both in the CLI manifest and keep the mutual-exclusion guard across all four spellings.
5. Update renderPretty and renderPlain to name the probed backend rather than printing a literal 'backlog:' line.
6. Tests: selecting quest probes quest and never spawns backlog; selecting jira probes jira; selecting none probes nothing; the deprecated backlog field still appears for a backlog bundle and is absent otherwise; the new flag spellings and their aliases.
7. Update docs/reference/cli-surface.md (flags, output, and the probe prose) and the manifest output summary. Run typecheck, lint, the full suite, and lore check.

Interaction to expect, not to fix here: with the probe following the selection, a quest bundle now surfaces the Quest version gate at init time instead of the spurious backlog warning. On the shipped 0.2.9 that gate still rejects until LCLI-356 replaces the exact-match allowlist with a minimum-version floor. That is the correct diagnostic for the user's actual setup, and it is what LCLI-356's 'the gate fails late' finding asks for.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification (2026-08-28).

Unit: bun test 2700 pass / 0 fail / 1 skip. Nine new tests in test/init.test.ts: quest selection probes quest and mentions backlog nowhere; jira selection probes jira and its missing [tracker.jira] table becomes the advisory rather than an uncaught throw; none probes nothing even under --check-tracker; a bundle with no --tracker follows its own persisted selection; a bare run probes nothing; --no-tracker skips what --agents implies; the --no-tracker/--check-backlog alias pair is still mutually exclusive; plain output names the probed backend. lint, typecheck, and lore check all exit 0.

Live (real CLI, real quest 0.2.9 workspace):
- AC#1/#2 quest: 'warning: quest coupling unavailable: `quest --version` did not return a supported Quest 0.2 version'. Envelope carries trackerCheck.backend == quest and no backlog field. The word backlog appears nowhere.
- AC#1/#2 jira: 'warning: jira coupling unavailable: tracker.jira configuration is required when the tracker backend is jira'. Exit 0 — advisory, not fatal.
- AC#3 none: trackerCheck absent, backlog absent, stderr empty.

Contract decision. InitResult gains trackerCheck { checked, backend, capable, version?, warning? }. The documented `backlog` field is kept, marked @deprecated, and populated ONLY when the selected backend is backlog — its exact historical meaning — so no existing --json consumer reads a Quest probe as a Backlog one and none breaks. A later task removes it.

Flags: --check-tracker / --no-tracker are the accurate spellings; --check-backlog / --no-backlog stay as aliases, the same pattern --agents already uses for --claude. Both pairs registered in the CLI manifest, mutual exclusion enforced across all four spellings.

Expected interaction, deliberately not fixed here: with the probe following the selection, a quest bundle now surfaces the Quest version gate at init time. On the shipped 0.2.9 that gate still rejects until LCLI-356 replaces the exact-match allowlist with a minimum-version floor. This is the correct diagnostic about the operator's actual setup, and it is what LCLI-356's own 'the gate fails late' finding asks for — the gate now fires at selection rather than on the first tracker command.

Seam documented, not endorsed: a brand-new bundle created over an existing backlog/ directory pins quest (init.ts's 'a newly created bundle is unambiguous' rule) and the probe follows that. A test records the behavior and points at LCLI-358.5, which owns whether init should pin quest over existing Backlog tasks at all.

Not verified here: the docker e2e suite. Two cases added to docker/e2e/run-e2e.sh, asserted on the envelope so they hold whether or not quest is installed in the image; bash -n passes and both jq filters were run against the real CLI locally. The container could not run — docker info exits 1 on this host.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
lore init's capability probe now follows the tracker the bundle actually selected. It previously constructed the adapter with a hardcoded backend: 'backlog', so choosing Quest reported that Backlog.md was uninitialized — a diagnostic about a tracker the operator had just declined.

probeTrackerCapability takes the resolved backend (the wizard's answer interactively, --tracker or the bundle's own persisted selection otherwise) and builds the adapter inside the try, so jira's missing [tracker.jira] configuration becomes the advisory it already is rather than an uncaught throw. Backend none probes nothing.

InitResult gains trackerCheck, which names the backend it probed; the documented backlog field is deprecated and populated only for a Backlog bundle, so no existing --json consumer breaks. Flags are now --check-tracker / --no-tracker with --check-backlog / --no-backlog as aliases. ADR-0017, cli-surface, the CLI manifest, and the README quickstart all updated.

Verified: bun test 2700 pass / 0 fail; lint, typecheck, and lore check exit 0. Live against a real quest 0.2.9 workspace, quest selection warns about quest and mentions backlog nowhere; jira selection warns about jira and exits 0; none is silent. Two docker/e2e cases added and their jq filters run against the real CLI, but the container suite could not run (docker info exits 1 on this host).
<!-- SECTION:FINAL_SUMMARY:END -->
