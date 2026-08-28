---
id: LCLI-354
title: Public opum-agent-workflow/v1 contract adapter for lore agent context
status: To Do
assignee: []
created_date: '2026-08-28 00:23'
updated_date: '2026-08-28 00:54'
labels:
  - release
  - quest
  - facade
dependencies:
  - LCLI-353
priority: high
type: feature
ordinal: 475000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #1 Public CLI: lore agent context <profile> --contract opum-agent-workflow/v1 --json consumes the exact request binding {contract:opum-agent-workflow, supportedVersions:[1], requestId:32hex, taskId:string} from stdin (or established public seam) and on success emits machine JSON on stdout adding contract:opum-agent-workflow, selectedVersion:1, requestId, taskId, contextId, profileId, profileRevision, digestAlgorithm:sha256, digest:64hex, issuedAt, expiresAt <=5min, sourceIds; #2 Fail closed with stderr-only stable markers OPUM_WORKFLOW_LORE_ABSENT/STALE/INCOMPATIBLE/MISMATCH for absent/stale/incompatible/mismatched profile/task/context binding, no invented fallback data; #3 Process-seam test-first: success plus all four failures with stdout/stderr/exit behavior; focused + full repository checks pass; #4 Checked PR to dev; any 0.3.4 candidate lacking the adapter invalidated; final 0.3.4 candidate/provenance/dry-run regenerated from merged dev; no npm publish/login/MFA/auth/dist-tag or registry writes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Explore existing agent context/profile/digest APIs. 2. Planner-derived minimal patch. 3. Test-first process-seam coverage. 4. Focused + full checks. 5. PR to dev, green merge. 6. Facade E2E vs packed quest 0.2.8 + lore 0.3.4 through no-op allocation/return lifecycle. 7. Candidate invalidation + regeneration; settle task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Adapter implemented test-first at the public CLI/process seam (d11c289, PR #432 green-merged to dev 30810e8): lore agent context <profile> --contract opum-agent-workflow/v1 --json with no --task consumes the exact stdin binding, emits the bare facade record (contract, selectedVersion:1, requestId, taskId, profileId, profileRevision=profile-file sha256, digestAlgorithm sha256, digest 64hex, contextId, issuedAt, expiresAt=+5min, sourceIds) and fails closed with stderr-only stable markers + bare {error:{code}} stdout envelopes, exit 1: ABSENT (empty binding / profile or inputs missing), STALE (pinned profileRevision != current), INCOMPATIBLE (contract/negotiation/structure), MISMATCH (binding profileId != CLI profile). Classic --task contract path untouched. Process-seam tests 6/6; full suite 2673/0/1 across 90 files; typecheck/lint clean; strict lore check clean; dispatcher findAgentProfile made show-only so the binding seam owns its absence failure. Facade E2E status: quest 0.2.8 candidate still NOT on the public registry (versions [0.1.0, 0.2.7] as of 2026-08-28), so the actual-facade run against exact packed Quest 0.2.8 + Lore 0.3.4 through the no-op allocation/return lifecycle remains externally gated (the facade needs quest 0.2.8's binding command to pass the QUEST stage before reaching the LORE stage); the lore-side seam is proven by the process tests and the candidate binary marker check. Candidate regeneration DONE: Release run 33130831083 (publish:false, success) on dev 30810e8, artifact 9670248434 staged at /Volumes/external/.opum-candidates/opum-doc-qualification-2026-08-27/final-lore-30810e8 (provenance sha256-OK, 7 rows, public_contract field, fresh all-seven dry-run); extracted candidate darwin-arm64 binary contains the OPUM_WORKFLOW_LORE markers. Earlier candidates invalidated: final-lore-c26180d (new INVALIDATED.md marker: lacks the adapter) and final-lore-f4aefe3 (already invalidated). Registry read-only: 0.3.4 absent on all seven packages.
<!-- SECTION:NOTES:END -->
