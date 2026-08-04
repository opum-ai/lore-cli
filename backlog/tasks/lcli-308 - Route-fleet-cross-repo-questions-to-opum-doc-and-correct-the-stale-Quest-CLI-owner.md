---
id: LCLI-308
title: >-
  Route fleet cross-repo questions to opum-doc and correct the stale Quest CLI
  owner
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-04 13:28'
updated_date: '2026-08-04 13:29'
labels: []
dependencies: []
ordinal: 421000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A fresh session in this repository has no way to learn how the fleet is actually addressed: peers are ephemeral live sessions reached machine.repo.name through per-machine claude-peer-* servers or, on the same host, through herdr — not per-repo MCP servers. It also has no pointer to the owner records for cross-repo ownership, package status, and infrastructure/DNS. Absent that, a session guesses, and stale GitHub owners look correct because the old org URLs still redirect. Add the routing pointer to CLAUDE.md, state the drift model between this repository and its -doc owners, correct the one remaining stale Quest CLI owner reference, and guard both with the existing repository-location test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CLAUDE.md directs a session to consult salient-data/opum-doc branch dev docs/reference/fleet-peer-routing-and-session-invocation.md before answering any cross-repo, ownership, package-status, or infrastructure question
- [ ] #2 CLAUDE.md names the saws infrastructure and DNS ADR in salient-data/opum-doc as the authority for every infrastructure, DNS, hosting, environment, and secrets-layout question
- [ ] #3 CLAUDE.md records that this repository is authoritative for shipped behavior while a -doc owner stays normative for the contract, and that a disagreement is drift reported to both owners rather than silently resolved
- [ ] #4 No active repository reference names salient-data/lore-cli or salient-data/quest-cli as a current operational route; the canonical owners opum-ai/lore-cli and opum-ai/quest-cli are used instead
- [ ] #5 No repository claim describes Quest or @opum-ai/quest as published or installable
- [ ] #6 test/repository-location.test.ts guards salient-data/quest-cli as a stale operational slug and covers CLAUDE.md, and lore validation plus lore check pass
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
