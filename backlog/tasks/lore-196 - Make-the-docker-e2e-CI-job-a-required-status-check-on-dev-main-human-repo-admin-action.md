---
id: LORE-196
title: >-
  Make the docker-e2e CI job a required status check on dev/main (human
  repo-admin action)
status: To Do
assignee: []
created_date: '2026-07-23 14:08'
labels:
  - needs-human
  - repo-admin
  - build-ci-config
dependencies: []
priority: low
type: chore
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome

The `docker-e2e` CI job runs on every PR and on pushes to `dev`/`main`, but it is **not enforced**: a red `docker-e2e` run does not block a merge, because the repo has **no branch protection and no repository ruleset at all**. This task closes that gap by getting a human repo-admin to either add `docker-e2e` as a **required status check** on the protected branch(es), or to record a deliberate decision that it stays advisory.

## Why it matters

LORE-100 wired the hermetic Docker E2E harness (~300 real-binary assertions over the full `lore` command surface) into CI as the `docker-e2e` job, and LORE-178 documented it in the runbook as a "CI gate (required, since LORE-100)". But "required" there is aspirational — the actual GitHub enforcement that would make a red run block a merge lives in **repo settings (branch protection / rulesets)**, which no workflow file can set and which LORE-100's own notes explicitly deferred ("AC2's 'required check' in the branch-protection sense is a repo-settings change outside any workflow file's reach … Branch protection must be updated separately by the orchestrator/user once the gate is green, or docker-e2e remains advisory"). Until then, a regression in anything the harness covers (LORE-61..68) can merge cleanly.

## The gate to enforce (verified against live `.github/workflows/ci.yml`)

- Workflow file: `.github/workflows/ci.yml`
- Job **id**: `docker-e2e` (`.github/workflows/ci.yml:117`)
- Job **name** = the **check-run / status-check context string** GitHub's branch-protection UI lists and that a human must select/type: **`docker e2e harness (real lore + backlog binaries)`** (`.github/workflows/ci.yml:118`). The job has no `matrix`, so the context is exactly this string (no `(os)` suffix).
- Triggers (so the check reports on the right refs): `push` to `branches: [dev, main]` and unfiltered `pull_request` (`.github/workflows/ci.yml:4`–`7`). runs-on `ubuntu-latest` (`.github/workflows/ci.yml:119`); results uploaded as the `docker-e2e-report` artifact (`.github/workflows/ci.yml:152`–`158`).

## Current state (observed live, read-only, ADMIN token — nothing changed)

- `gh api repos/jeremy-newhouse/lore/branches/dev/protection` -> **HTTP 404 `{"message":"Branch not protected"}`**
- `gh api repos/jeremy-newhouse/lore/branches/main/protection` -> **HTTP 404 `Branch not protected`**
- `gh api repos/jeremy-newhouse/lore/branches` -> `dev protected=False`, `main protected=False`
- `gh api repos/jeremy-newhouse/lore/rulesets` -> `[]` (no repository rulesets either)
- `gh repo view` -> `viewerPermission: ADMIN` — so the 404 is **not** a token-permission artifact; it definitively means **neither branch has any classic protection or ruleset**. Consequence: **no CI job currently gates merges** on either branch; `docker-e2e` is advisory today.

## Human-only boundary (important)

Toggling GitHub branch-protection / ruleset settings is a **repo-admin action in the GitHub web/API settings** that an autonomous agent must **not** perform. Because there is currently **zero** protection/ruleset on either branch, this is not "add one check to existing protection" — the human must **first create branch protection (classic) or a repository ruleset** for `dev` (and decide about `main`), **then** add the required status check named `docker e2e harness (real lore + backlog binaries)`. An agent's role here is limited to **preparing and verifying** (surfacing the exact check name, confirming a recent `docker-e2e` run is green so a red gate isn't flipped to required, drafting the decision text) — it must not silently change repo settings and must not self-authorize the toggle.

## Notes for whoever picks this up

- Confirm a recent `docker-e2e` run on the target branch is **green before** enabling enforcement — LORE-100 flagged the risk of a temporarily-red required gate (the stale LORE-64 `check`-profile assertion that made the harness baseline red was since fixed by LORE-176, Done, so the baseline should now pass, but verify a real run rather than assume).
- Verify enforcement afterward via `gh api repos/jeremy-newhouse/lore/branches/dev/protection` (or `.../rulesets`) showing `docker e2e harness (real lore + backlog binaries)` under `required_status_checks`.
- Broader observation for the human (out of this task's strict scope but relevant to the decision): since **no** branch protection exists, the core `check` matrix job and the other CI jobs are likewise unenforced — the human may want to decide those in the same settings pass.

Provenance: follow-up flagged in LORE-100 (Done) and LORE-178 (Done); `backlog search "branch protection"` and `backlog search "docker-e2e"` returned no task tracking the required-check/branch-protection toggle, so this is net-new.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For the default branch `dev`, an explicit outcome is reached and recorded: EITHER the docker-e2e GitHub Actions check — check-run context `docker e2e harness (real lore + backlog binaries)` (job id `docker-e2e` in .github/workflows/ci.yml) — is configured as a REQUIRED status check via classic branch protection or a repository ruleset, verifiable by `gh api repos/jeremy-newhouse/lore/branches/dev/protection` (or `.../rulesets`) listing that context under required_status_checks; OR a decision is recorded (in this task's notes and/or a docs/ decision record) that docker-e2e is intentionally NOT required on dev, with a stated rationale.
- [ ] #2 The same explicit decision is made and recorded for `main` (either the docker-e2e check is a required status check on main, verifiable via the branch-protection/rulesets API, or a recorded decision with rationale that it is intentionally not required).
- [ ] #3 If the 'make it required' path is chosen for a branch, it is recorded that a recent docker-e2e workflow run on that branch was confirmed GREEN before enforcement was enabled (so a red gate is not flipped to required), and enforcement is confirmed present via the GitHub API after the change.
- [ ] #4 The task notes record that the branch-protection / ruleset change itself was performed by a human repo-admin (or with explicit human sign-off), and that no autonomous agent toggled repo settings — the agent's contribution is limited to preparing and verifying (exact check name, green-baseline confirmation, drafting the decision).
- [ ] #5 The exact required-check context string a human must add — `docker e2e harness (real lore + backlog binaries)` — is captured in the task (or linked decision) alongside the note that the repo currently has NO branch protection or ruleset, so protection/a ruleset must be created before the check can be marked required.
<!-- AC:END -->
