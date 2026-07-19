---
id: LORE-60
title: >-
  ADR-0002 overstates the capability-probe exit code: says
  missing/too-old/incapable backlog all map to exit 6, but a missing binary is
  really exit 3
status: To Do
assignee: []
created_date: '2026-07-19 15:18'
labels:
  - bug
  - docs
  - cli-contract
dependencies:
  - LORE-56
references:
  - src/adapters/backlog.ts
  - docs/adr/0002-backlog-integration-json-only.md
priority: low
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR-0002 (docs/adr/0002-backlog-integration-json-only.md), Decision point 5: "If backlog is missing, too old, or does not understand --json, lore exits with a clear, actionable error (validation/drift exit code 6) pointing at the patch runbook." The real, deliberate code in src/adapters/backlog.ts (probeBacklog, around line 144-162) intentionally splits this into two distinct cases, with its own inline comment explaining why: "a missing binary (ENOENT) is not_found (exit 3) with an install hint, distinct from a present-but-incapable binary (exit 6)." Confirmed against a real pinned-upstream-binary run (LORE-56): removing backlog from PATH entirely and running any lore command that needs it (e.g. lore tasks <id> on a concept with real linked tasks) produces error_type: "not_found", exit 3 -- not exit 6.

The code's distinction is reasonable (an agent should be able to tell "go install backlog" apart from "your backlog is too old/wrong build" via exit code alone), so the fix should be to the documentation, not the behavior: ADR-0002 and any downstream doc repeating its "exit 6 for missing/too-old/incapable" framing (check docs/reference/backlog-cli-contract.md and docs/runbooks/agent-onboarding.md for the same overclaim) should be corrected to say a fully-missing binary is not_found/exit 3, and only a present-but-too-old-or-incapable binary is validation/exit 6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0002 Decision point 5 is corrected to distinguish exit 3 (backlog missing entirely) from exit 6 (backlog present but too old or not --json-capable)
- [ ] #2 docs/reference/backlog-cli-contract.md and docs/runbooks/agent-onboarding.md are checked for the same overclaim and corrected if present
<!-- AC:END -->
