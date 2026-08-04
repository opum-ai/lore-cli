---
id: LCLI-283.2
title: Ship the local graph explorer
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:33'
updated_date: '2026-08-03 16:10'
labels:
  - graph-explorer
  - local-graph
  - visualization
  - 'doc:stories/build-the-persistent-local-graph-platform'
milestone: m-14
dependencies:
  - LCLI-283.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/stories/build-the-persistent-local-graph-platform.md
parent_task_id: LCLI-283
priority: high
type: feature
ordinal: 391000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a Lore-specific, read-only local graph explorer after the persistent-index milestone so users can navigate authored concepts, tasks, relationships, provenance, and graph health without a hosted service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The explorer consumes a stable Lore projection contract and never reads or writes LadybugDB through browser-supplied Cypher
- [x] #2 Users can search and filter nodes, inspect details and provenance, follow inbound and outbound relationships, and identify dangling and supersession states
- [x] #3 A deterministic static snapshot works fully offline and a loopback-only live mode may refresh from the same contract
- [x] #4 Accessible keyboard navigation, responsive layouts, bounded rendering, and large-fixture performance gates pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconfirm LCLI-283.1 and all three explorer child tasks are Done with every acceptance criterion checked at integration head 44b74ca. (Parent eligibility)
2. Run the focused contract, command, static-artifact, qualification, browser, workflow, typecheck, and lint gates that objectively cover parent AC #1-#4; retain the already-green terminal-head CI run 30726854290 as cross-platform integration evidence.
3. Perform an adversarial consistency review against the parent criteria, the frozen explorer contract, and the roadmap; record exact results and residual limitations.
4. If and only if the evidence proves each criterion, check AC #1-#4, write the final summary, and mark LCLI-283.2 Done. Keep the guarded lease and branch local; do not commit, push, open or merge a PR, return the lease, mutate the primary checkout, or start LCLI-283.3.1 without separate authorization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave 10 parent reconciliation (2026-08-01):

- Grounded the guarded Treehouse lease cfcdc8e668e2896b207029fe46657a49 at integration head 44b74ca5daf94df19e7f14dd69a09829bc030d87 on feature/lcli-283-2-parent-settlement. The primary checkout and retained LCLI-289 lease were not changed.
- Eligibility check passed: LCLI-283.1 and children LCLI-283.2.1, LCLI-283.2.2, and LCLI-283.2.3 are Done and every acceptance criterion is checked.
- Local host Bun 1.3.14 focused verification passed 23 tests and 184 expectations across explorer contract, artifact, command, qualification, and CI-workflow coverage. bun run typecheck and bun run lint passed; Biome checked 166 files. git diff --check passed.
- Local Playwright qualification passed all five Chromium cases, covering keyboard and semantic detail flows, non-color and responsive behavior, empty/corrupt/stale health handling, reproducible credential-free offline behavior with zero network requests, and frozen scale budgets. Firefox and WebKit could not launch because those browser binaries are not installed locally; no product assertion failed.
- Remote terminal-head evidence closes that environment gap: GitHub PR #275 is MERGED with exact head e1975086ea476b29cb40e5cc79a07d5d51827c49 and merge commit 44b74ca5daf94df19e7f14dd69a09829bc030d87. All eight checks in run 30726854290 succeeded, including explorer browser qualification on Chromium, Firefox, and WebKit, Ubuntu and Windows full gates, compile, documentation scaffolds, Ladybug smoke, and Docker E2E.
- Adversarial self-review mapped each parent criterion to executable child evidence and found no unsupported claim, raw browser Cypher or credential surface, network-dependent static path, missing required interaction, or unbounded large-fixture behavior. No source or documentation change is required for parent settlement.

Delivery boundary: all parent criteria and the final summary are prepared, but the required Backlog metadata is not integrated into dev. Restore mode did not grant commit, push, PR, merge, or lease-return authority, so the task remains In Progress until the isolated settlement branch is delivered and reverified.

Delivery authorization (2026-08-01): the user explicitly approved committing the two verified Backlog records, pushing feature/lcli-283-2-parent-settlement, opening and monitoring its PR, merging only if required checks are green, and guarded-returning only lease cfcdc8e668e2896b207029fe46657a49 after exact merged-state revalidation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settled the local graph explorer parent after verifying that LCLI-283.1 and all three explorer children are Done with fully checked criteria. The integrated explorer contract, deterministic offline artifact and CLI, required navigation/provenance states, accessibility behavior, and frozen scale budgets passed 23 focused tests, typecheck, lint, five local Chromium cases, and terminal-head CI run 30726854290 with all eight jobs green including Chromium/Firefox/WebKit qualification. The local Firefox/WebKit launch gap is limited to missing browser binaries and is covered by the successful exact merged-head CI evidence.
<!-- SECTION:FINAL_SUMMARY:END -->
