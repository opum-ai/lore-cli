---
id: LCLI-346
title: Normalize Lore Treehouse 2.2 repository/pool identity
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-21 15:57'
updated_date: '2026-08-21 16:40'
labels: []
dependencies: []
ordinal: 469000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
treehouse.toml currently sets root = ".treehouse", which makes Treehouse 2.2.0 resolve the pool to the nested .treehouse/.treehouse/lore-cli-f70589 path and produces a CLI-selected pool identity that does not match the physical pool under the default transport (status --json returns [] until the https-insteadOf transport convention is applied). Normalize the owner-local Treehouse configuration to the canonical root "." so the resolved pool path, Git worktree registry, and physical pool state agree under one consistent transport convention, with a valid three-layer Git/Treehouse/physical audit before and after. ODOC-63 DAG node T-L (infrastructure-housekeeping); dispatched by Controller opum-doc correlation 849b8cb76e464f66a6f3b632d1697df1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 treehouse.toml uses the canonical root "." semantics and the resolved pool identity matches the physical pool under one consistent transport convention
- [ ] #2 Three-layer audit (Git worktree registry, Treehouse status, physical paths) passes before and after the change with no unintended loss of lease or worktree state
- [ ] #3 Focused repository checks, backlog validation, and strict lore validate/check pass; diff hygiene verified
- [ ] #4 Delivered via reviewed PR to dev with all required checks terminal-green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit three-layer state (Git worktree registry, Treehouse status under consistent transport, physical paths) at pinned base 7171eb15356925ceaad2dabdd99a5a5f693e2acd; prove slot 3 (feat/lcli-343-344-trackerless-hermes) fully integrated/unique-work-preserved before reclaim. 2. Reclaim only that proven slot via identity-fenced treehouse return; re-audit all three layers. 3. Lease a separate execution worktree from origin/dev 7171eb1 with immutable lease ID; create owned branch. 4. Change treehouse.toml root ".treehouse" -> "." and prove resolved pool identity semantics match the physical pool under one transport convention. 5. Run focused checks (npm test target), backlog validation, strict lore validate/check, diff hygiene. 6. Commit without amend, push task branch, open PR to dev, monitor checks to terminal, merge if green. 7. Return node-created lease artifacts only when proved disposable; preserve all pre-existing dirty/leased/unique state.
<!-- SECTION:PLAN:END -->
