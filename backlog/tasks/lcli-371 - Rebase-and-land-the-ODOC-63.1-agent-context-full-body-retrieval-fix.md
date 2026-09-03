---
id: LCLI-371
title: Rebase and land the ODOC-63.1 agent-context full-body retrieval fix
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-31 18:54'
updated_date: '2026-09-03 00:29'
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
- [x] #1 src/cli.ts's agent context handler switches to loadReferenceRetrievalGraph, rebased cleanly onto current origin/dev
- [x] #2 docker/e2e/run-e2e.sh phase 22b (ODOC-63.1 packed agent-context surface guard through the compiled binary) lands, including its throwaway e2e-pack-surface/e2e-pack-bad fixture teardown
- [x] #3 the pre-existing AC4 jq filter bug in the agents --check healing test (missing bracket grouping, filter passed vacuously) is fixed
- [x] #4 docs/runbooks/agent-profile-operation.md example TOML is corrected (schema_version field, max_tokens rename) to match the real schema
- [x] #5 full bun test suite, typecheck, lint, and lore check all pass on the rebased branch before it is opened as a PR
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rebase feat/odoc-63.1-agent-profiles onto current origin/dev (151 commits of drift -- expect conflicts, especially in run-e2e.sh which has grown substantially). Verify loadReferenceRetrievalGraph still exists with the same signature. Re-run the new e2e phase and full test suite. Open a PR once green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Picked up fresh session per handover, opag directive 2026-09-02. Verified branch state: feat/odoc-63.1-agent-profiles is 2 commits ahead of origin/dev (5a3115c, fe5cfcd), both real/wanted. Proceeding with git rebase origin/dev per prior comment's plan.

Verified: rebase was already clean (0 conflicts) before this session touched it -- confirmed independently and cross-checked against opag's concurrent read-only verification (matched). Ran full suite post-rebase: bun test 2783 pass/1 skip/0 fail (92 files); tsc --noEmit clean; biome lint clean after auto-fixing 2 pre-existing format drifts in cli.ts/test file (151-commit-old formatting vs current biome config); lore check --strict: 76 files, 0 errors, 0 warnings. Found and fixed a real defect while verifying AC#3: the committed jq filter for the AC4 nudge-block healing check was NOT actually fixed by the original commit despite its message -- diff shows it replaced VALID jq ((.data.files | all(.action == "unchanged"))) with an invalid bracket sequence that is a hard jq compile error, not the vacuous pass it claimed to close. Restored the valid form (matches the other 3 occurrences in the file). Spot-checked jq syntax on all 4 new Phase 22b filters -- all parse. Opened PR #518 -> dev. Phase 22b not executed against real docker (no local docker in this session) -- verified by static review only.

PR #518 CI: all 9 checks pass, including docker e2e harness which live-exercised Phase 22b (all 6 assertions PASS with real jq output confirmed via job log) and confirmed the AC4 jq fix works live (exit 0). AC#2 now checked with real execution evidence, not static review. All 5 ACs verified.

GENERALIZABLE FINDING (opag, worth recording beyond this task): the AC#3 jq-bracket defect is an instance of CLAUDE.md's 'gate asserting its own claim instead of the artifact' shape -- the prior commit's message CLAIMED to fix the bracket-grouping bug, and that claim was trusted rather than the diff verified against real jq syntax, so the fix landed backwards (valid jq replaced with an invalid bracket sequence) and nobody caught it because nothing re-derived the claim from the artifact. Same shape LCLI-365's whole premise names (two independent literals agreeing proves nothing) -- found here in a commit MESSAGE's claim about its own diff, not in code. The lesson generalizes past this one line: verify a commit's stated fix against its actual diff, not its description.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 20:12
---
Independent cross-check, 2026-09-02: an unverified issues dump from other agents' lore/quest sessions (relayed via opum-agent) reported two symptoms that trace to this exact defect. Verified both live against current dev source (bun run src/cli.ts, unpatched):

- Whole-doc pin -> agent context body is empty, contentDigest = sha256("") = e3b0c442...b855.
- Heading-anchor pin on a heading that genuinely exists -> "references missing heading" validation error, because src/core/agent-profile.ts's validateAgentProfileReferences computes headingSlugs(concept.body) from the SAME empty body.

Then patched src/cli.ts line 627 alone (context.retrieval ?? loadRetrievalGraph -> loadReferenceRetrievalGraph, matching this task's already-committed fix on feat/odoc-63.1-agent-profiles) and re-ran both cases: both now return correct non-empty bodies and real digests. Confirms this task's fix, once landed, resolves both symptoms -- no separate task needed for either.
---

created: 2026-09-02 22:37
---
Handover, deferring to a fresh session per opag's explicit standing ruling (a large rebase deserves fresh context; the risk under low context/time-pressure is exactly --force or discarding conflicts, which must never happen here -- both commits are real, wanted work).

Current drift, measured just now (2026-09-02, not the earlier 174 estimate): 187 commits behind origin/dev. Growing daily as dev accumulates merges; re-measure at pickup time rather than trusting this number.

Concrete risk assessment, so a fresh session doesn't have to re-derive it: checked which of the two touched files have actually drifted since the branch's base (7171eb1).
- src/cli.ts: ZERO commits touched it in that whole window. The actual functional fix (switching context.retrieval's default from loadRetrievalGraph to loadReferenceRetrievalGraph at the agent: dispatcher) should apply with NO conflict. Low risk.
- docker/e2e/run-e2e.sh: 9 commits touched it, 270 lines changed (135 insertions/135 deletions -- heavy edits, likely phase renumbering/insertions similar to what I did myself several times today). The new Phase 22b this branch adds will almost certainly conflict and need manual re-placement into whatever the current phase structure looks like, not a clean patch apply. This is where the real time goes.

Recommended approach for the fresh session: `git rebase origin/dev` (not merge) so each of the 2 commits' conflicts are resolved individually rather than as one combined diff; expect the run-e2e.sh commit (fe5cfcd, or possibly both since 5a3115c also touches it) to need manual conflict resolution, not auto-merge. After rebase: re-run docker e2e locally if possible (or at minimum the new Phase 22b's assertions) before opening the PR, since the surrounding phases it references may have shifted.

Not blocked on any decision -- purely a matter of doing the rebase carefully with the context budget it deserves.
---
<!-- COMMENTS:END -->
