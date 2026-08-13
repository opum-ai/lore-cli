---
id: LCLI-322
title: Restore single-active-cursor hygiene for ignored handover archives
status: Done
assignee:
  - '@codex'
created_date: '2026-08-10 19:59'
updated_date: '2026-08-13 04:42'
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
2. Add focused process-level tests for the clean single-pointer case, retained non-executable provenance, duplicate cursor markers, stale paste-ready prompts, runnable restore language, safe-resume language, and a missing lifecycle designation.
3. Update the backlog-handover skill so init, restore, write, and status use active.md, retire obsolete cursors only after evidence reconciliation, and run the lifecycle audit.
4. Inventory all 57 obsolete local handovers against live Backlog/Git evidence, preserve any unique unfinished fact in durable task/tracker notes, and remove the exact obsolete files from .claude/handovers while leaving unrelated work untouched.
5. Re-ground active.md to live Git/Backlog state; run focused audit tests, the real-directory audit, and proportional repository gates.
6. Finalize acceptance evidence, settle doc-17, synchronize the owning Story through Lore, and deliver only through the user-authorized dedicated branch while preserving LCLI-323 through LCLI-325 on their research branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification and disposition (2026-08-13)

- Baseline: 58 ignored Markdown handovers existed: canonical active.md plus 57 obsolete archives. A broad inventory found 28 executable-style matches; the stricter lifecycle audit now classifies the canonical lifecycle marker, paste-ready prompts, runnable restore sequences, and safe-resume language deterministically.
- Grounding: live Backlog contained no other In Progress task; sampled historical claims through LCLI-321 were Done; the retained LCLI-315.1 base was an ancestor of dev. Unique still-relevant evidence was preserved in LCLI-322 and doc-17 before archive removal.
- Retained in .claude/handovers/: active.md only, marked lifecycle: executable and re-grounded to live branch/task/worktree state. No stale local-artifact path is presented as available.
- Removed from .claude/handovers/ and placed in a recoverable session-local quarantine outside the repository: HANDOVER-2026-07-21T105420Z.md, HANDOVER-2026-07-21T130922Z.md, HANDOVER-2026-07-21T220303Z.md, HANDOVER-2026-07-26-backlog-campaign.md, HANDOVER-2026-08-01-backlog-campaign-10.md, HANDOVER-2026-08-01-backlog-campaign-11.md, HANDOVER-2026-08-01-backlog-campaign-12.md, HANDOVER-2026-08-01-backlog-campaign-13.md, HANDOVER-2026-08-01-backlog-campaign-14.md, HANDOVER-2026-08-01-backlog-campaign-2.md, HANDOVER-2026-08-01-backlog-campaign-3.md, HANDOVER-2026-08-01-backlog-campaign-4.md, HANDOVER-2026-08-01-backlog-campaign-5.md, HANDOVER-2026-08-01-backlog-campaign-6.md, HANDOVER-2026-08-01-backlog-campaign-7.md, HANDOVER-2026-08-01-backlog-campaign-8.md, HANDOVER-2026-08-01-backlog-campaign-9.md, HANDOVER-2026-08-01-backlog-campaign.md, HANDOVER-2026-08-02-backlog-campaign-15.md, HANDOVER-2026-08-02-backlog-campaign-16.md, HANDOVER-2026-08-02-backlog-campaign-17.md, HANDOVER-2026-08-02-backlog-campaign-18.md, HANDOVER-2026-08-02-backlog-campaign-19.md, HANDOVER-2026-08-02-backlog-campaign-20.md, HANDOVER-2026-08-02-backlog-campaign-21.md, HANDOVER-2026-08-02-backlog-campaign-22.md, HANDOVER-2026-08-02-backlog-campaign-23.md, HANDOVER-2026-08-02-backlog-campaign-24.md, HANDOVER-2026-08-03-LCLI-253-published-release-migration.md, HANDOVER-2026-08-04-backlog-campaign-cleanup.md, HANDOVER-2026-08-04-backlog-campaign-lcli-298-settled.md, HANDOVER-2026-08-04-backlog-campaign-lcli-298.md, HANDOVER-2026-08-04-backlog-campaign-lcli-299-settled.md, HANDOVER-2026-08-04-backlog-campaign-lcli-300-settled.md, HANDOVER-2026-08-04-backlog-campaign-lcli-300-verified.md, HANDOVER-2026-08-04-backlog-campaign-lcli-302-promoted.md, HANDOVER-2026-08-04-backlog-campaign-lcli-302-settled.md, HANDOVER-2026-08-04-backlog-campaign-lcli-302-verified.md, HANDOVER-2026-08-04-backlog-campaign-round-9.md, HANDOVER-2026-08-04-backlog-campaign.md, HANDOVER-2026-08-04T172405Z-backlog-campaign-lcli-305-verified.md, HANDOVER-2026-08-04T173623Z-backlog-campaign-lcli-305-settled.md, HANDOVER-2026-08-04T190400Z-backlog-campaign-lcli-306-verified.md, HANDOVER-2026-08-04T192514Z-backlog-campaign-lcli-306-settled.md, HANDOVER-2026-08-05T174958Z-backlog-campaign-lcli-314-6-verified.md, HANDOVER-2026-08-05T181735Z-backlog-campaign-complete.md, HANDOVER-2026-08-05T224220Z-backlog-campaign-lcli-319-verified.md, HANDOVER-2026-08-05T225013Z-backlog-campaign-lcli-319-committed.md, HANDOVER-2026-08-05T225943Z-backlog-campaign-lcli-319-pr-open.md, HANDOVER-2026-08-06T010208Z-backlog-campaign-lcli-317-verified.md, HANDOVER-2026-08-06T013020Z-backlog-campaign-lcli-317-committed.md, HANDOVER-2026-08-06T013539Z-backlog-campaign-lcli-317-pr-open.md, HANDOVER-2026-08-06T020033Z-backlog-campaign-lcli-317-integrated.md, HANDOVER-2026-08-07T053440Z-backlog-campaign-lcli-315-1-retained.md, HANDOVER-2026-08-09T054844Z-backlog-campaign-0.2.0.md, HANDOVER-2026-08-09T080218Z-backlog-campaign-0.2.0.md, HANDOVER-2026-08-09T1406Z-lore-cli-0.2.0-publication.md.
- Guardrail: audit-handover-lifecycle.mjs requires exactly active.md as the executable pointer, rejects missing/multiple lifecycle designations, and rejects executable cursor, paste-ready, restore, or safe-resume language in non-executable archives. The backlog-handover skill now audits init/write/restore/status and retires obsolete cursors only after evidence reconciliation.
- Focused verification: bun test test/backlog-handover-lifecycle.test.ts => 7 pass, 0 fail, 13 assertions. Real-directory lifecycle audit => pass with exactly one active pointer. npm run typecheck => pass. npm run lint => pass (196 files). npm test => 2,560 pass, 1 skip, 0 fail across 79 files (8,739 assertions). git diff --check => pass.
- Isolation note: the first full-suite attempt exposed only a missing worktree-local native dependency (2,555 pass, 1 skip, 1 failure); linking the existing ignored dependency installation into the isolated worktree restored the intended environment, and the complete rerun passed.
- Delivery isolation: corrective research commit 4187947 restored only LCLI-322/doc-17 there while retaining LCLI-323 through LCLI-325. This implementation remains on dedicated local branch chore/lcli-322-handover-hygiene pending separate remote-delivery authorization.

Delivery update (2026-08-13): user authorized remote delivery. Branch chore/lcli-322-handover-hygiene was pushed at 63df417 and PR #354 was opened against dev. The PR head matched 63df417 at creation; merge remains unperformed and outside the current authorization.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Established active.md as the sole executable handover cursor, quarantined all 57 obsolete ignored archives after live-state reconciliation, added a deterministic lifecycle audit with adversarial process tests, and hardened backlog-handover init/write/restore/status. Verified with 7 focused tests, the real-directory audit, typecheck, lint, git diff --check, and the full suite (2,560 pass, 1 skip, 0 fail).
<!-- SECTION:FINAL_SUMMARY:END -->
