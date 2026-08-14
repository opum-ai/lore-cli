---
id: LCLI-308
title: >-
  Route fleet cross-repo questions to opum-doc and correct the stale Quest CLI
  owner
status: Done
assignee:
  - '@claude'
created_date: '2026-08-04 13:28'
updated_date: '2026-08-14 11:00'
labels:
  - 'doc:stories/maintain-lore-cli-documentation-authority'
dependencies: []
documentation:
  - docs/stories/maintain-lore-cli-documentation-authority.md
ordinal: 421000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A fresh session in this repository has no way to learn how the fleet is actually addressed: peers are ephemeral live sessions reached machine.repo.name through per-machine claude-peer-* servers or, on the same host, through herdr — not per-repo MCP servers. It also has no pointer to the owner records for cross-repo ownership, package status, and infrastructure/DNS. Absent that, a session guesses, and stale GitHub owners look correct because the old org URLs still redirect. Add the routing pointer to CLAUDE.md, state the drift model between this repository and its -doc owners, correct the one remaining stale Quest CLI owner reference, and guard both with the existing repository-location test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CLAUDE.md directs a session to consult salient-data/opum-doc branch dev docs/reference/fleet-peer-routing-and-session-invocation.md before answering any cross-repo, ownership, package-status, or infrastructure question
- [x] #2 CLAUDE.md names the saws infrastructure and DNS ADR in salient-data/opum-doc as the authority for every infrastructure, DNS, hosting, environment, and secrets-layout question
- [x] #3 CLAUDE.md records that this repository is authoritative for shipped behavior while a -doc owner stays normative for the contract, and that a disagreement is drift reported to both owners rather than silently resolved
- [x] #4 No active repository reference names salient-data/lore-cli or salient-data/quest-cli as a current operational route; the canonical owners opum-ai/lore-cli and opum-ai/quest-cli are used instead
- [x] #5 No repository claim describes Quest or @opum-ai/quest as published or installable
- [x] #6 test/repository-location.test.ts guards salient-data/quest-cli as a stale operational slug and covers CLAUDE.md, and lore validation plus lore check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify every routed claim by live probe before writing it: npm status of @opum-ai/lore and @opum-ai/quest, the canonical GitHub owner of quest-cli behind the redirect, and read access plus file existence for the two cited opum-doc records on branch dev.
2. Add an unmanaged 'Fleet routing and cross-repository authority' section to CLAUDE.md, outside the backlog and lore managed blocks so neither generator rewrites it. It names this repository's canonical slug, routes cross-repo/ownership/package-status/infrastructure questions to salient-data/opum-doc docs/reference/fleet-peer-routing-and-session-invocation.md on branch dev, names the saws ADR as the infrastructure and DNS authority, records that peers are live sessions addressed machine.repo.name over per-machine claude-peer-* servers rather than per-repo MCP servers, and states the drift model.
3. Correct docs/reference/lore-cli-documentation-ownership.md: the Quest CLI owner becomes opum-ai/quest-cli, add the fleet routing reference as the routing owner, and replace the audit-conflict sentence with the two-sided drift rule so it agrees with the owner record.
4. Extend test/repository-location.test.ts: add salient-data/quest-cli to the stale operational slugs and CLAUDE.md to the operational documents so both regressions are guarded.
5. Verify with lore validate --strict, lore check, the repository-location test, then the full lint, typecheck, and test suites.
6. Report the reconciled divergence back to the opum-doc session and record the outcome in the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification basis: every routed claim was checked by live probe on 2026-08-04 before being written, not copied from the notice. npm reports @opum-ai/lore@0.1.0 created 2026-08-04T02:38:03.368Z and @opum-ai/quest as a 404. gh api repos/salient-data/quest-cli resolves to opum-ai/quest-cli, confirming the redirect hides a stale owner. Read access to the private salient-data/opum-doc was confirmed, dev head 7b512d9 matched the notice, and both cited records exist at that ref: docs/reference/fleet-peer-routing-and-session-invocation.md and docs/adr/make-saws-the-single-owner-of-infrastructure-and-dns.md.

The repository-location guard caught the first draft of both warning paragraphs, which spelled the stale slugs literally to warn about them. Rather than loosen the assertion, the prose was reworded to 'both CLIs former salient-data URLs still redirect'. That keeps the invariant absolute: the stale strings appear nowhere outside the guard's own list.

One reconciled divergence: this repository previously stated that an owner-local contract controls over the opum-doc audit. The owner record's rule 8 says a *-cli/*-doc conflict is drift, with the *-cli peer authoritative for shipped behavior and the *-doc peer normative for the contract, reported to both. The local sentence was replaced with the two-sided rule, and the divergence was reported to the opum-doc owner session.

CHANGELOG was deliberately not touched: LCLI-293 and LCLI-294, the comparable documentation-authority and repository-transfer tasks, added no entry, so routing documentation is not treated as a user-facing change here.

Verification: lore validate --strict passed 64 files with 0 errors and 0 warnings; lore check exited 0; test/repository-location.test.ts passed 6/6 with 98 assertions; biome lint reported no findings in any file changed by this task; the full suite ran 2434 tests with 2433 passing.

Concurrency caveat, honestly reported: a Codex agent was working the LCLI-302 native-backend fix in this same worktree throughout. The single failing test (test/ladybug-benchmark-workflow.test.ts) parses .github/workflows/release.yml, which that agent is mid-edit on; the one tsc error and two biome warnings are confined to test/ladybug-package-qualification.test.ts, also its file. None of the four files changed here can affect either. The commit was scoped by explicit path to CLAUDE.md, docs/log.md, docs/reference/lore-cli-documentation-ownership.md, and test/repository-location.test.ts so the concurrent work was neither committed nor disturbed; a feature branch was deliberately not cut because switching the shared worktree would have disrupted that agent. Commit e973120 on dev, not pushed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Gave a fresh session in this repository the fleet routing it could not derive locally, and closed the one stale owner reference the org move left behind.

CLAUDE.md now routes every cross-repository, ownership, package-status, and infrastructure question to salient-data/opum-doc branch dev docs/reference/fleet-peer-routing-and-session-invocation.md, names the saws ADR as the infrastructure and DNS authority, records that peers are ephemeral sessions addressed machine.repo.name over per-machine claude-peer-* servers rather than a per-repo MCP namespace, and states the drift model: this repository is authoritative for what ships, the *-doc owner stays normative for the contract, and a disagreement is reported to both rather than resolved in favor of code. The documentation ownership reference corrects the Quest CLI owner to opum-ai/quest-cli, records @opum-ai/quest as unpublished so Quest is never called installable, adds the routing and infrastructure owners, and replaces a one-sided owner-local-wins rule that contradicted the owner record.

Every routed claim was verified by live probe on 2026-08-04 before being written: npm confirmed @opum-ai/lore@0.1.0 and a 404 for @opum-ai/quest, gh api showed salient-data/quest-cli resolving to opum-ai/quest-cli behind the redirect, and opum-doc dev head 7b512d9 was readable with both cited records present.

Verified by lore validate --strict (64 files, 0 errors, 0 warnings), lore check (exit 0), test/repository-location.test.ts (6/6, 98 assertions), clean biome lint on every file this task changed, and a full suite of 2434 tests with 2433 passing. The single failure and the only tsc error belong to a Codex agent's concurrent in-flight LCLI-302 edits to release.yml and the ladybug qualification test in the shared worktree; no file changed here can affect either, and the commit was path-scoped so that work was neither committed nor disturbed.
<!-- SECTION:FINAL_SUMMARY:END -->
