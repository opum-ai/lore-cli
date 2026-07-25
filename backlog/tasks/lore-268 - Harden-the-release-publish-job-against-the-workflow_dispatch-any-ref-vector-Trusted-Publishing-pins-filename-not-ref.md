---
id: LORE-268
title: >-
  Harden the release publish job against the workflow_dispatch-any-ref vector
  (Trusted Publishing pins filename, not ref)
status: To Do
assignee: []
created_date: '2026-07-25 23:20'
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
- [ ] #1 The publish job's protection no longer depends solely on content inside release.yml: an out-of-file control (GitHub Environment protection rule, or an equivalent chosen and justified in the plan) gates it, so a modified copy of the workflow on an attacker-controlled branch does not bypass it.
- [ ] #2 The chosen approach and its rationale are recorded, including why an in-workflow ref guard alone is insufficient.
- [ ] #3 test/release-workflow.test.ts asserts the new out-of-file gate is declared in the workflow (e.g. the job carries the expected environment), so removing it fails a test.
- [ ] #4 docs/runbooks/release-publishing.md states exactly which repo-admin steps the user must perform for the protection to be live, and what the residual risk is until they are done — no claim that the risk is closed by the workflow change alone.
- [ ] #5 Existing LORE-255 guarantees are preserved: dispatch-only trigger, publish input defaulting false, id-token: write scoped to the publish job, npm >= 11.5.1 fail-closed floor, platform-packages-before-root ordering, 0.0.0 refusal. Full suite + lore check stay green.
<!-- AC:END -->
