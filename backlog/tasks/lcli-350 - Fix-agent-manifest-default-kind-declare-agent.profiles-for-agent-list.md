---
id: LCLI-350
title: 'Fix agent manifest default kind: declare agent.profiles for agent list'
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-26 00:37'
updated_date: '2026-08-26 23:12'
labels: []
dependencies: []
type: bug
ordinal: 470000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 manifest kind for the agent command is agent.profiles, matching the list action emission and docs/reference/cli-surface.md; golden test updated; live-vs-manifest cross-check passes for agent actions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Change src/core/manifest.ts agent command kind from agent.context.export to agent.profiles (public contract per docs/reference/cli-surface.md §agent list), keeping resultKinds unchanged. 2. Update golden map in test/help.test.ts. 3. Add regression assertion that lore agent list --json emits exactly the manifest-declared kind. 4. Run focused tests + lint/typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#1 verified objectively in audit 8a71a8b0ac14473ba15ba02ed449fed3: src/core/manifest.ts:708 declares kind agent.profiles (merged e2a8c17); test/help.test.ts golden map and agent resultKinds pin the contract; test/agent-profile.test.ts regression pins that the manifest-declared default kind equals what the primary list action emits. Under pinned bun 1.3.14 on dev a4322b7: full suite 2662 pass / 0 fail / 1 skip across 89 files; packaged-candidate smoke from /tmp/lore-0.3.3-family-a4322b7 install emitted exactly {kind:agent.profiles}.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Aligned the capability manifest's agent command default kind with the public contract: declared agent.profiles (the kind the primary list action emits), keeping show/context result kinds unchanged (merged upstream at e2a8c17). Verified by golden-map and regression assertions plus audit-correlation gates: pinned-runtime suite 2662/0/1, strict lore validate/check clean, packaged candidate live emission matches the declared kind.
<!-- SECTION:FINAL_SUMMARY:END -->
