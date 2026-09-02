---
id: LCLI-376
title: lore init selects quest as tracker without checking quest was ever initialized
status: To Do
assignee: []
created_date: '2026-09-02 20:19'
labels: []
dependencies: []
references:
  - User-reported directly
  - >-
    relayed via opum-agent 2026-09-02; marker corrected by qcli and
    independently re-verified before filing
modified_files:
  - src/commands/init.ts
priority: high
type: bug
ordinal: 503000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore init --tracker quest (or the interactive wizard choosing quest) persists [tracker] backend = "quest" to .lore/config.toml purely on the strength of the quest PACKAGE being installed and version-verified (verifySelectedBackend, LCLI-356) -- it never checks whether the quest WORKSPACE itself has been initialized. A user can end up with backend = "quest" while quest init was never run, and nothing catches it: lore check exits 0 with no errors or warnings. This is a narrow control-flow guard, not full integration -- lore init should not auto-invoke quest init, handle its failures, or pass args through (that is real cross-repo work); it should simply refuse to select quest as backend when quest was never initialized, with a clear message telling the user to run quest init first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 when persisting backend = "quest" (interactive or --tracker quest), lore init checks for quest's init marker (.quest/workspace.toml) and refuses with a clear message ("quest backend selected but quest init hasn't run -- run it first") if it is missing, rather than silently persisting the selection
- [ ] #2 the check does not attempt to invoke quest init itself, pass through its flags, or handle its failures -- refusal only, per the user's own stated scope
- [ ] #3 regression test runs lore init --tracker quest in a repo where quest was never initialized and asserts a refusal rather than a silent 0-exit persist
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Confirmed 2026-09-02 against dev source: lore init --yes --tracker quest in a fresh repo with quest never initialized wrote backend = "quest" to .lore/config.toml, exited 0, and left .quest/ nonexistent; lore check afterward still reported 0 errors/0 warnings. The init marker to check is .quest/workspace.toml (workspaceConfigurationPath, src/application/workspaces/workspaces.ts:33 in quest-cli, written by initializeWorkspace() since QCLI-126/132) -- confirmed independently by running quest init in a scratch repo and observing exactly that file get created, with nothing else. NOTE: opum-agent's original relay said the marker was CLAUDE.md/AGENTS.md and pointed at QCLI-159 as a blocking dependency; qcli corrected this directly -- QCLI-159 is scoped to which agent instruction file(s) quest init writes (a docs-target question), unrelated to workspace-init state. Do not gate this on QCLI-159 and do not check for CLAUDE.md/AGENTS.md presence.
<!-- SECTION:PLAN:END -->
