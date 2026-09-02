---
id: LCLI-371
title: Rebase and land the ODOC-63.1 agent-context full-body retrieval fix
status: In Progress
assignee: []
created_date: '2026-08-31 18:54'
updated_date: '2026-09-02 20:12'
labels: []
dependencies: []
references:
  - feat/odoc-63.1-agent-profiles branch
  - commits 5a3115c and fe5cfcd
modified_files:
  - src/cli.ts
  - docker/e2e/run-e2e.sh
  - docs/runbooks/agent-profile-operation.md
  - test/agent-profile-pack-surface.test.ts
priority: medium
type: bug
ordinal: 498000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore agent context used loadRetrievalGraph (the indexed graph), which intentionally materializes metadata and edges without every concept body. Agent profiles need several complete concept bodies, so the indexed path produced empty evidence packs for an indexed repository. The fix is already implemented and committed on feat/odoc-63.1-agent-profiles (2 commits on top of PR #411's merge base, 7171eb1), but that branch is 151 commits behind origin/dev and was never landed -- it was found as uncommitted work sitting in a stray worktree (/Volumes/external/repos/lore-odoc-63.1-agent-profiles) during a fleet-wide branch cleanup pass on 2026-08-31.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/cli.ts's agent context handler switches to loadReferenceRetrievalGraph, rebased cleanly onto current origin/dev
- [ ] #2 docker/e2e/run-e2e.sh phase 22b (ODOC-63.1 packed agent-context surface guard through the compiled binary) lands, including its throwaway e2e-pack-surface/e2e-pack-bad fixture teardown
- [ ] #3 the pre-existing AC4 jq filter bug in the agents --check healing test (missing bracket grouping, filter passed vacuously) is fixed
- [ ] #4 docs/runbooks/agent-profile-operation.md example TOML is corrected (schema_version field, max_tokens rename) to match the real schema
- [ ] #5 full bun test suite, typecheck, lint, and lore check all pass on the rebased branch before it is opened as a PR
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rebase feat/odoc-63.1-agent-profiles onto current origin/dev (151 commits of drift -- expect conflicts, especially in run-e2e.sh which has grown substantially). Verify loadReferenceRetrievalGraph still exists with the same signature. Re-run the new e2e phase and full test suite. Open a PR once green.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 20:12
---
Independent cross-check, 2026-09-02: an unverified issues dump from other agents' lore/quest sessions (relayed via opum-agent) reported two symptoms that trace to this exact defect. Verified both live against current dev source (bun run src/cli.ts, unpatched):

- Whole-doc pin -> agent context body is empty, contentDigest = sha256("") = e3b0c442...b855.
- Heading-anchor pin on a heading that genuinely exists -> "references missing heading" validation error, because src/core/agent-profile.ts's validateAgentProfileReferences computes headingSlugs(concept.body) from the SAME empty body.

Then patched src/cli.ts line 627 alone (context.retrieval ?? loadRetrievalGraph -> loadReferenceRetrievalGraph, matching this task's already-committed fix on feat/odoc-63.1-agent-profiles) and re-ran both cases: both now return correct non-empty bodies and real digests. Confirms this task's fix, once landed, resolves both symptoms -- no separate task needed for either.
---
<!-- COMMENTS:END -->
