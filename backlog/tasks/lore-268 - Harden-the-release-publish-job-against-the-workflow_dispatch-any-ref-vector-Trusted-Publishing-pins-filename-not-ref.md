---
id: LORE-268
title: >-
  Harden the release publish job against the workflow_dispatch-any-ref vector
  (Trusted Publishing pins filename, not ref)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 23:20'
updated_date: '2026-07-26 12:05'
labels:
  - security
  - build-ci-config
dependencies: []
priority: medium
type: task
ordinal: 369000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The npm publish job in `.github/workflows/release.yml` should not be reachable from an arbitrary ref, so that an actor with write access cannot publish by pushing a branch that carries a modified `release.yml`.

## Observed
Recorded by the LORE-255 reviewer and confirmed at merge time; documented in round-4 tracker doc-5, never fixed.

npm **Trusted Publishing pins the repository + the workflow FILENAME — not a ref**. The publish job is reachable via `workflow_dispatch` on **any** ref. So an actor with write access can:
1. push a branch containing a `release.yml` with the guards stripped (the `if: inputs.publish == true` gate, the `0.0.0` refusal, the npm-version floor),
2. dispatch that workflow **on their branch**, and
3. publish — because OIDC trusted publishing still matches on repo + filename.

Every in-workflow guard LORE-255 added is defeated by this, because the attacker supplies the workflow file itself.

## Why it matters
lore has not published yet, so nothing is exploitable today — but this is precisely the window in which to fix it. Once the package name is claimed on npm, this becomes a supply-chain exposure on a package other people install. This queue is itself the follow-up backlog of a security review, so shipping a known-reachable publish path would be the wrong note to end on.

## Direction (decide in plan; a ref guard alone is NOT sufficient)
An `if: github.ref == …` guard inside the workflow is **not** a real mitigation — it lives in the same file the attacker replaces. The mitigation has to sit **outside** the workflow file:
- **GitHub Environment with required reviewers** (likely the right answer): declare `environment: release` on the publish job. Environment protection rules are repo configuration, not workflow content, so they still apply when the workflow file is modified. Can additionally restrict which branches may deploy to that environment.
- and/or restrict who may run `workflow_dispatch` at all.
- and/or move publishing to a `release`/tag trigger with a protected tag ruleset.

Record the chosen approach and its rationale, and state plainly in the runbook what the residual risk still is.

## Scope split — read before planning
- **Agent-doable**: the `release.yml` change (e.g. adding `environment:`), the assertions in `test/release-workflow.test.ts` that pin it, and the `docs/runbooks/release-publishing.md` update.
- **Human/repo-admin**: actually creating the GitHub Environment and configuring its required reviewers / allowed branches. An agent must not self-authorize that (same boundary as LORE-196 and LORE-257). The task is complete when the workflow-side change is shipped and the runbook documents exactly which repo-admin steps the user must perform for the protection to take effect — flag that clearly rather than implying the risk is closed.

## Refs
.github/workflows/release.yml (the `publish` job, its `if:`/`id-token`/`needs` wiring), test/release-workflow.test.ts, docs/runbooks/release-publishing.md, LORE-255 (Done — added the publish job), LORE-257 / LORE-196 (the same agent-must-not-self-authorize repo-admin boundary).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The publish job's protection no longer depends solely on content inside release.yml: an out-of-file control (GitHub Environment protection rule, or an equivalent chosen and justified in the plan) gates it, so a modified copy of the workflow on an attacker-controlled branch does not bypass it.
- [x] #2 The chosen approach and its rationale are recorded, including why an in-workflow ref guard alone is insufficient.
- [x] #3 test/release-workflow.test.ts asserts the new out-of-file gate is declared in the workflow (e.g. the job carries the expected environment), so removing it fails a test.
- [x] #4 docs/runbooks/release-publishing.md states exactly which repo-admin steps the user must perform for the protection to be live, and what the residual risk is until they are done — no claim that the risk is closed by the workflow change alone.
- [x] #5 Existing LORE-255 guarantees are preserved: dispatch-only trigger, publish input defaulting false, id-token: write scoped to the publish job, npm >= 11.5.1 fail-closed floor, platform-packages-before-root ordering, 0.0.0 refusal. Full suite + lore check stay green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Mitigation chosen: declare `environment: release` on the `publish` job in
   .github/workflows/release.yml. Rationale (AC#2): GitHub Environment protection
   rules (required reviewers / allowed deployment branches) are repo Settings
   configuration, evaluated by GitHub's deployment subsystem when a job attempts
   to run against a named environment -- NOT content inside the workflow file, so
   they still apply even when release.yml itself has been replaced wholesale on an
   attacker-controlled branch. An in-workflow `if: github.ref == ...` guard is NOT
   equivalent and is explicitly rejected: it lives in the exact file an attacker
   with write access already controls, so it is trivially stripped/edited away --
   the guard and the thing it's supposed to guard live in the same trust boundary.
   The environment approach only closes the loop fully once BOTH external pieces
   are configured (repo-admin, not me): (a) the "release" GitHub Environment
   itself has required reviewers and/or a deployment-branch policy restricting
   which branches may deploy to it, and (b) npm's Trusted Publisher config for all
   six packages has its "Environment name" field set to "release" (already a
   documented-but-blank field in the runbook's Step 1) so npm's own OIDC
   verification requires that environment claim -- closing the residual loophole
   where an attacker simply deletes the `environment:` line from their forged
   copy of the workflow (GitHub auto-creates a referenced environment with NO
   protection rules by default, so the bare declaration alone is inert without
   (a), and without (b) npm doesn't require the claim at all so omitting the key
   entirely bypasses (a)).
2. release.yml: add `environment: release` to the `publish` job with an inline
   comment explaining the out-of-file rationale and that it is inert until the
   two repo-admin steps above are done. Verify all 6 LORE-255 guarantees still
   hold (dispatch-only trigger, publish input default false, id-token: write
   scoped to publish job only, npm >= 11.5.1 floor, platform-before-root publish
   order, 0.0.0 refusal).
3. test/release-workflow.test.ts: extend WorkflowJob type with `environment?:
   string`, add a test asserting doc.jobs.publish.environment === "release".
   Mutation-check: temporarily delete the line, confirm the new test fails
   (via git diff patch + git apply -R / git apply, not git stash), restore,
   confirm bun test green again.
4. docs/runbooks/release-publishing.md: update Step 1's "Environment name" field
   from "leave blank" to "release" with rationale; add an explicit repo-admin
   setup checklist item (create the "release" GitHub Environment, required
   reviewers and/or branch restriction) alongside the First-release checklist;
   add an explicit residual-risk statement: until both the GitHub Environment
   protection rules AND the npm Trusted Publisher environment-name requirement
   are configured, the environment declaration in release.yml provides no actual
   protection and the workflow_dispatch-any-ref exposure LORE-268 describes
   remains open.
5. CHANGELOG.md: add an [Unreleased]/Added entry for LORE-268, verified against
   the actual diff (not reconstructed), stating precisely what is and is not
   protected by the workflow-side change alone.
6. Verify: bun test (compare to dev baseline 2176/0), bun run lore check
   (compare to baseline 40 files/0/0), bun run lint, bun run typecheck, and
   confirm the workflow YAML parses (test suite already parses it via js-yaml).
7. Mark Done with notes naming verification evidence and the outstanding
   repo-admin steps; commit in small Conventional Commits with Refs: LORE-268
   trailers, including backlog/tasks/ edits; push feature/LORE-268.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: release.yml's `publish` job now declares `environment: release`
(out-of-file gate — GH Environment protection rules are repo Settings config,
not workflow content, so they survive a wholesale-replaced release.yml on an
attacker branch; an in-workflow ref guard was explicitly rejected because it
lives in the same file the attacker controls). Documented in inline YAML
comments, test comments, and a new runbook section
"Repo-admin setup for the release Environment (LORE-268)" — two explicit
repo-admin checklist items: (1) create the GH Environment `release` with
required reviewers and/or a deployment-branch policy, (2) set npm Trusted
Publisher's Environment name field to `release` for all six packages (closes
the loophole where an attacker just deletes the `environment:` line from a
forged copy — without (2) that omission has no consequence since nothing
requires the claim). Explicit residual-risk statement: until BOTH are done,
the environment declaration is inert (GitHub auto-creates a referenced
environment with no rules by default) and the workflow_dispatch-any-ref
exposure remains fully open. I did not touch any repo/GitHub settings, did
not call gh api, did not create the environment — that boundary was
respected per the task's scope split (same as LORE-196/LORE-257).

test/release-workflow.test.ts: added WorkflowJob.environment field + a new
test asserting doc.jobs.publish.environment === "release". Mutation check:
`git diff > /tmp/LORE-268-release-yml.patch`, deleted the `environment:
release` line with sed, ran `bun test test/release-workflow.test.ts` -> 9
pass / 1 fail (only the new test failed, all 9 pre-existing tests stayed
green), restored via `git checkout -- <file> && git apply
/tmp/LORE-268-release-yml.patch` (not git stash, per hard rules), re-ran ->
10 pass / 0 fail.

LORE-255 guarantees re-verified present after the edit (grep + full suite):
workflow_dispatch-only trigger (on: workflow_dispatch, single key),
publish input default: false, if: ${{ inputs.publish == true }} on the
publish job, id-token: write scoped to the publish job only (existing test
still asserts no other job has it), npm >= 11.5.1 floor assertion, "Publish
5 platform binaries first, launcher LAST" step, and the 0.0.0 refusal guard.

Verification: bun test 2177 pass / 0 fail (dev baseline is 2176/0; +1 for
the new test) across 49 files. bun run lore check: 40 files, 0 errors, 0
warnings (matches dev baseline). bun run lint (biome check .): clean, 112
files. bun run typecheck (tsc --noEmit): clean. actionlint
.github/workflows/release.yml: exit 0, no findings — confirms the workflow
YAML is valid GitHub Actions syntax including the new environment: key
(release-workflow.test.ts's js-yaml JSON_SCHEMA parse of the same file was
already exercised by every test in that suite passing).

CHANGELOG.md: added an [Unreleased]/Fixed entry, every factual claim checked
against the actual diff and grep output before writing (not reconstructed
from memory) per the campaign's standing instruction about round-4's false
claims.

Files touched (exactly the task's declared scope, confirmed via git diff
--stat): .github/workflows/release.yml, test/release-workflow.test.ts,
docs/runbooks/release-publishing.md, CHANGELOG.md, backlog/tasks/lore-268*.
No sibling-task files (agents.ts, doc-6 tracker, ADR-0009) touched.

Fix pass (post-review): CHANGELOG.md's bolded lead falsely claimed the environment: release declaration was 'closing' the workflow_dispatch-on-any-ref exposure, contradicting the same entry's own later claim that 'the declaration alone does not yet provide protection.' Reworded the lead to call environment: release 'the out-of-file hook for closing' the exposure, inert until two repo-admin steps are done -- no closure claim, no self-contradiction. Also corrected docs/runbooks/release-publishing.md's deployment-branch-policy guidance: it presented a branch policy restricting deploys to main/release/* as a standalone alternative to required reviewers, but verified live via gh api that main carries NO branch protection (repos/jeremy-newhouse/lore/branches/main/protection -> 404 'Branch not protected') and the repo's only ruleset (require-docker-e2e-on-dev, id 19698059) targets refs/heads/dev only and enforces a required status check, not PR-only pushes. So today a deployment-branch policy restricted to main would NOT stop the attack this section exists to prevent -- an actor with write access can push a forged release.yml straight to unprotected main and dispatch it there. The runbook now states required reviewers as the option that holds regardless of branch protection, and states the branch-policy option is only sound if the allowed branch(es) are themselves protected against direct pushes -- which, in this repo today, they are not. The user should treat this as a live fact to address when doing the repo-admin half (either configure required reviewers on the release Environment, or add branch protection/a ruleset barring direct pushes to whichever branch a deployment-branch policy would allow). Also moved the unnumbered 'Repo-admin setup for the release Environment (LORE-268)' section from between Steps 1 and 2 to under ## Prerequisites, preserving the Steps section's 1/2/3 reading order; heading text and anchor (#repo-admin-setup-for-the-release-environment-lore-268) unchanged so the three existing cross-references (First-release checklist, Step 1, Step 2) still resolve, only two forward/backward-reference words ('below'/'above') were flipped to match the new position. lore check still reports 40 files/0/0. release.yml and test/release-workflow.test.ts untouched by this pass (confirmed via git diff).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped the out-of-file hook for closing the workflow_dispatch-any-ref vector in .github/workflows/release.yml's publish job: added `environment: release` (GitHub Environment protection rules live in repo Settings, not workflow content, so they survive a wholesale-replaced release.yml on an attacker branch -- unlike an in-workflow ref guard, which was explicitly rejected and documented as insufficient). This does not itself close the exposure -- it stays fully open until a repo admin completes two follow-up steps: creating the release GitHub Environment with required reviewers and/or a deployment-branch policy, and setting npm Trusted Publisher's Environment name field to release for all six packages. Extended test/release-workflow.test.ts to pin the new field (mutation-verified: deleting the line drops 10/10 pass to 9 pass/1 fail; restored). Added a 'Repo-admin setup for the release Environment (LORE-268)' section to docs/runbooks/release-publishing.md naming both manual steps and stating plainly that until both are done the environment declaration is inert and the exposure remains open; a post-review fix pass also corrected that section's deployment-branch-policy guidance after verifying live that main carries no branch protection and the repo's only ruleset (require-docker-e2e-on-dev) doesn't bar direct pushes to main either -- so required reviewers is the option documented as holding regardless of branch protection, and the branch-policy option is now flagged as unsound in this repo today. All six LORE-255 guarantees verified intact. Verified: bun test 2177/0 pass (baseline 2176 + 1 new test), lore check 40 files/0/0, lint and typecheck clean, actionlint clean on release.yml. Did not create the GitHub Environment, configure branch protection, or touch any other repo setting -- left to the repo admin per the task's scope split.
<!-- SECTION:FINAL_SUMMARY:END -->
