---
id: LCLI-322
title: Restore single-active-cursor hygiene for ignored handover archives
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-10 19:59'
updated_date: '2026-08-13 03:59'
labels:
  - handover
  - lifecycle
  - archive-hygiene
  - follow-up
  - 'doc:stories/maintain-lore-cli-documentation-authority'
dependencies: []
references:
  - >-
    backlog/tasks/lcli-293 -
    Reconcile-Lore-CLI-release-truth-handover-lifecycle-and-Story-ownership.md
documentation:
  - docs/stories/maintain-lore-cli-documentation-authority.md
modified_files:
  - .claude/handovers/
  - .codex/skills/backlog-handover/
  - test/backlog-handover-lifecycle.test.ts
  - docs/stories/maintain-lore-cli-documentation-authority.md
priority: medium
type: chore
ordinal: 445000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore the handover lifecycle invariant established by LCLI-293. Live inspection on 2026-08-10 found 58 ignored Markdown files under .claude/handovers, with 27 carrying executable continue, paste-ready, or safe-resume cursor language. These local archives can misroute a future session even though the tracked archive was previously normalized. Reconcile the ignored handovers against live Git and Backlog state, preserve unique unfinished evidence, and add durable guardrails so obsolete cursors do not accumulate again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Exactly one current ignored handover is designated as executable; every obsolete ignored handover is removed after safe-state verification or retained only as concise past-tense non-executable provenance
- [x] #2 The current handover is re-grounded against live Git and Backlog state and contains no stale local-artifact path presented as available
- [x] #3 A deterministic lifecycle audit distinguishes the active pointer from obsolete handovers and fails when more than one executable cursor, paste-ready prompt, or runnable resume sequence exists
- [x] #4 Cleanup preserves unique unfinished campaign evidence, does not expose secrets or machine-specific paths in tracked history, and records the disposition of every removed or retained handover
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define an explicit lifecycle marker and canonical active.md pointer, then add a deterministic audit script that scans ignored Markdown handovers and rejects a missing/misnamed active pointer, multiple executable cursors, paste-ready prompts, or runnable resume sequences.
2. Add focused process-level tests for the clean single-pointer case, retained non-executable provenance, duplicate cursor markers, stale paste-ready prompts, runnable restore language, and a missing lifecycle designation.
3. Update the backlog-handover skill so init, restore, write, and status use active.md, retire obsolete cursors only after evidence reconciliation, and run the lifecycle audit.
4. Inventory all 57 obsolete local handovers against live Backlog/Git evidence, preserve any unique unfinished fact in durable task/tracker notes, and move the exact obsolete files out of .claude/handovers to a recoverable temporary quarantine while leaving unrelated research changes untouched.
5. Re-ground active.md to the live branch, SHA, task, tracker, dirty-path boundary, and last verified stage; run the focused audit tests, audit the real handover directory, and perform repository gates proportional to the tracked skill/test changes.
6. Run the task-finalization guide, verify every acceptance criterion individually, record exact evidence and the disposition inventory through Backlog CLI, and settle doc-17 honestly without performing unauthorized commit, push, PR, merge, branch deletion, or publication actions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restore, implementation, cleanup, and adversarial self-review evidence (2026-08-12/13):

- Grounded dispatch: dev and locally known origin/dev both pointed to 319edc7fc3fafef7a384834eee418545aa2dc484; one worktree; no other task In Progress; LCLI-322 had no dependencies. Unrelated user-owned competitive-research changes under docs/ and research/ were classified as non-overlapping and left untouched.
- Baseline lifecycle drift: 58 ignored Markdown files existed under .claude/handovers. active.md plus 27 other files matched the broad executable/paste-ready/safe-resume inventory; the stricter audit identified 26 obsolete files with explicit runnable signals and rejected every remaining unmarked archive.
- Safe-state verification: doc-10, doc-11, doc-13, doc-14, doc-15, and doc-16 are complete. LCLI-298, LCLI-299, LCLI-300, LCLI-302, LCLI-303, LCLI-304, LCLI-305, LCLI-306, LCLI-314.6, LCLI-315.1, LCLI-317, LCLI-318, LCLI-319, LCLI-320, and LCLI-321 are Done; no task is In Progress besides LCLI-322; the old LCLI-315.1 base is an ancestor of dev. The obsolete publication pointer's machine-local artifact claim was intentionally not copied into durable history because release truth is already settled in doc-16/LCLI-321.
- Retained disposition: active.md only. It is marked **Lifecycle**: executable-current and re-grounded to the live SHA, tracker, task state, one-worktree topology, unrelated dirty-path boundary, authorization boundary, and last verified stage. It presents no stale local artifact as available.
- Removed disposition: all 57 obsolete files were moved out of .claude/handovers into a recoverable session-local quarantine outside the repository. No obsolete handover was retained in the active directory. Exact removed filenames: `HANDOVER-2026-07-21T105420Z.md`, `HANDOVER-2026-07-21T130922Z.md`, `HANDOVER-2026-07-21T220303Z.md`, `HANDOVER-2026-07-26-backlog-campaign.md`, `HANDOVER-2026-08-01-backlog-campaign-10.md`, `HANDOVER-2026-08-01-backlog-campaign-11.md`, `HANDOVER-2026-08-01-backlog-campaign-12.md`, `HANDOVER-2026-08-01-backlog-campaign-13.md`, `HANDOVER-2026-08-01-backlog-campaign-14.md`, `HANDOVER-2026-08-01-backlog-campaign-2.md`, `HANDOVER-2026-08-01-backlog-campaign-3.md`, `HANDOVER-2026-08-01-backlog-campaign-4.md`, `HANDOVER-2026-08-01-backlog-campaign-5.md`, `HANDOVER-2026-08-01-backlog-campaign-6.md`, `HANDOVER-2026-08-01-backlog-campaign-7.md`, `HANDOVER-2026-08-01-backlog-campaign-8.md`, `HANDOVER-2026-08-01-backlog-campaign-9.md`, `HANDOVER-2026-08-01-backlog-campaign.md`, `HANDOVER-2026-08-02-backlog-campaign-15.md`, `HANDOVER-2026-08-02-backlog-campaign-16.md`, `HANDOVER-2026-08-02-backlog-campaign-17.md`, `HANDOVER-2026-08-02-backlog-campaign-18.md`, `HANDOVER-2026-08-02-backlog-campaign-19.md`, `HANDOVER-2026-08-02-backlog-campaign-20.md`, `HANDOVER-2026-08-02-backlog-campaign-21.md`, `HANDOVER-2026-08-02-backlog-campaign-22.md`, `HANDOVER-2026-08-02-backlog-campaign-23.md`, `HANDOVER-2026-08-02-backlog-campaign-24.md`, `HANDOVER-2026-08-03-LCLI-253-published-release-migration.md`, `HANDOVER-2026-08-04-backlog-campaign-cleanup.md`, `HANDOVER-2026-08-04-backlog-campaign-lcli-298-settled.md`, `HANDOVER-2026-08-04-backlog-campaign-lcli-298.md`, `HANDOVER-2026-08-04-backlog-campaign-lcli-299-settled.md`, `HANDOVER-2026-08-04-backlog-campaign-lcli-300-settled.md`, `HANDOVER-2026-08-04-backlog-campaign-lcli-300-verified.md`, `HANDOVER-2026-08-04-backlog-campaign-lcli-302-promoted.md`, `HANDOVER-2026-08-04-backlog-campaign-lcli-302-settled.md`, `HANDOVER-2026-08-04-backlog-campaign-lcli-302-verified.md`, `HANDOVER-2026-08-04-backlog-campaign-round-9.md`, `HANDOVER-2026-08-04-backlog-campaign.md`, `HANDOVER-2026-08-04T172405Z-backlog-campaign-lcli-305-verified.md`, `HANDOVER-2026-08-04T173623Z-backlog-campaign-lcli-305-settled.md`, `HANDOVER-2026-08-04T190400Z-backlog-campaign-lcli-306-verified.md`, `HANDOVER-2026-08-04T192514Z-backlog-campaign-lcli-306-settled.md`, `HANDOVER-2026-08-05T174958Z-backlog-campaign-lcli-314-6-verified.md`, `HANDOVER-2026-08-05T181735Z-backlog-campaign-complete.md`, `HANDOVER-2026-08-05T224220Z-backlog-campaign-lcli-319-verified.md`, `HANDOVER-2026-08-05T225013Z-backlog-campaign-lcli-319-committed.md`, `HANDOVER-2026-08-05T225943Z-backlog-campaign-lcli-319-pr-open.md`, `HANDOVER-2026-08-06T010208Z-backlog-campaign-lcli-317-verified.md`, `HANDOVER-2026-08-06T013020Z-backlog-campaign-lcli-317-committed.md`, `HANDOVER-2026-08-06T013539Z-backlog-campaign-lcli-317-pr-open.md`, `HANDOVER-2026-08-06T020033Z-backlog-campaign-lcli-317-integrated.md`, `HANDOVER-2026-08-07T053440Z-backlog-campaign-lcli-315-1-retained.md`, `HANDOVER-2026-08-09T054844Z-backlog-campaign-0.2.0.md`, `HANDOVER-2026-08-09T080218Z-backlog-campaign-0.2.0.md`, `HANDOVER-2026-08-09T1406Z-lore-cli-0.2.0-publication.md`.
- Durable guardrail: .codex/skills/backlog-handover/scripts/audit-handover-lifecycle.mjs requires active.md, the executable-current marker, and a paste-ready section; requires every retained non-active Markdown file to be explicitly historical-non-executable; rejects additional current markers, paste-ready prompts, continuation directives, task resume directives, safe-resume sequences, and backlog-handover restore invocations.
- Skill contract: init, restore, write, and status now use active.md as the canonical pointer, never create timestamped executable handovers, reconcile unique evidence before cleanup, and run/report the audit.
- Automated evidence: focused lifecycle suite passed 7 tests / 13 assertions; real-directory audit passed with active.md as the sole executable cursor; full npm test passed 2,559 tests with 1 platform skip and 0 failures; npm run typecheck passed; npm run lint checked 196 files with no findings; strict Lore validation passed 69 files with 0 errors and 0 warnings; git diff --check passed.
- Adversarial self-review: expanded the startup rule so a missing active.md is audited whenever the directory exists, and added explicit safe-resume detection plus a failing fixture. No subagent or independent review was authorized, so this was an adversarial self-review.
- Current delivery boundary: no commit, push, PR, merge, branch deletion, or publication action is authorized. Lore dry-run with --no-index reports only the owning Story as needing reconciliation and reports no Backlog commit; the Story will remain coupled to LCLI-322's honest In Progress state until delivery/final settlement is authorized.
<!-- SECTION:NOTES:END -->
