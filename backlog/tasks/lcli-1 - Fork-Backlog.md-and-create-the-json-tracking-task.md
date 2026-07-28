---
id: LCLI-1
title: Fork Backlog.md and create the --json tracking task
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - backlog-fork
milestone: m-0
dependencies: []
documentation:
  - docs/runbooks/backlog-json-patch.md
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fork MrLesk/Backlog.md to jeremy-newhouse/Backlog.md and create the in-fork Backlog task per its PR template.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Public fork exists at jeremy-newhouse/Backlog.md
- [x] #2 In-fork task created with AC + plan + Testing per the PR template
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create public fork MrLesk/Backlog.md -> jeremy-newhouse/Backlog.md via 'gh repo fork --clone=false' (AC#1).
2. Clone the fork to ~/repos/Backlog.md (INTERNAL disk, not /Volumes/external, per external-volume-bun-exdev-traps) and add upstream remote.
3. Verify toolchain: bun --version, bun install.
4. Create the in-fork tracking task with 'backlog task create' inside the fork (it dogfoods Backlog.md), with AC + plan + Testing per the PR template (AC#2). Capture the back-XXX id for the LCLI-2 branch name.
5. Push the in-fork task commit to the fork; check both ACs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered (external-repo setup; no lore-repo PR).
- Fork: https://github.com/jeremy-newhouse/Backlog.md (public, isFork=true, parent=MrLesk/Backlog.md). AC#1 met.
- Fork checkout: ~/repos/Backlog.md (INTERNAL disk per external-volume-bun-exdev-traps). Repurposed a pre-existing upstream clone: renamed origin->upstream (MrLesk), added origin->jeremy-newhouse fork; main tracks origin/main and is current with upstream (bun 1.2.23, matches DEVELOPMENT.md pin).
- In-fork tracking task: back-510 'Add --json output to read commands', with 5 AC + 6-step plan + 3 DoD (tsc/check/test) per the fork's PR template. AC#2 met.
- Pushed on branch tasks/back-510-json-output (commit 'BACK-510 - Add tracking task...') to origin (fork). This is the LCLI-2 working branch.
- ID-COLLISION HAZARD: upstream has an UNMERGED branch tasks/back-510-repeated-label-flags whose back-510 is a different task. Highest id on upstream/main today is 509, so back-510 is the correct next id now. If upstream merges their back-510 before we rebase/PR, RENUMBER our fork task then (renames the file + id: frontmatter). Defer per runbook backlog-json-patch.md section 8 (rebase periodically, re-grep).
<!-- SECTION:NOTES:END -->
