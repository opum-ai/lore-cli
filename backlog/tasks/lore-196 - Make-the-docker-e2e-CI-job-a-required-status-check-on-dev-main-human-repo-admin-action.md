---
id: LORE-196
title: >-
  Make the docker-e2e CI job a required status check on dev/main (human
  repo-admin action)
status: Done
assignee: []
created_date: '2026-07-23 14:08'
updated_date: '2026-07-24 16:49'
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
- [x] #1 For the default branch `dev`, an explicit outcome is reached and recorded: EITHER the docker-e2e GitHub Actions check — check-run context `docker e2e harness (real lore + backlog binaries)` (job id `docker-e2e` in .github/workflows/ci.yml) — is configured as a REQUIRED status check via classic branch protection or a repository ruleset, verifiable by `gh api repos/jeremy-newhouse/lore/branches/dev/protection` (or `.../rulesets`) listing that context under required_status_checks; OR a decision is recorded (in this task's notes and/or a docs/ decision record) that docker-e2e is intentionally NOT required on dev, with a stated rationale.
- [x] #2 The same explicit decision is made and recorded for `main` (either the docker-e2e check is a required status check on main, verifiable via the branch-protection/rulesets API, or a recorded decision with rationale that it is intentionally not required).
- [x] #3 If the 'make it required' path is chosen for a branch, it is recorded that a recent docker-e2e workflow run on that branch was confirmed GREEN before enforcement was enabled (so a red gate is not flipped to required), and enforcement is confirmed present via the GitHub API after the change.
- [x] #4 The task notes record that the branch-protection / ruleset change itself was performed by a human repo-admin (or with explicit human sign-off), and that no autonomous agent toggled repo settings — the agent's contribution is limited to preparing and verifying (exact check name, green-baseline confirmation, drafting the decision).
- [x] #5 The exact required-check context string a human must add — `docker e2e harness (real lore + backlog binaries)` — is captured in the task (or linked decision) alongside the note that the repo currently has NO branch protection or ruleset, so protection/a ruleset must be created before the check can be marked required.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
---

## Agent prep + verification (2026-07-23, read-only; nothing in repo settings was changed) [AC4]

An agent performed the preparation/verification half of this task only. No branch protection, ruleset, or any GitHub setting was created or modified. The human repo-admin step (creating protection + selecting the required check, or recording a keep-advisory decision) is still outstanding.

### Verified live (2026-07-23, viewerPermission=ADMIN token, read-only)
- Repo `jeremy-newhouse/lore`, default branch `dev`.
- `gh api repos/jeremy-newhouse/lore/branches/dev/protection` -> HTTP 404 "Branch not protected".
- `gh api repos/jeremy-newhouse/lore/branches/main/protection` -> HTTP 404 "Branch not protected".
- `gh api repos/jeremy-newhouse/lore/rulesets` -> `[]`.
- `gh api .../branches` -> dev protected=false, main protected=false.
- => The task's original observation still holds exactly: the repo has ZERO branch protection and ZERO rulesets on either branch, so protection/a ruleset must be CREATED before any check can be marked required.

### Exact required-check context string [AC5]
Confirmed against live `.github/workflows/ci.yml`:
- Job id: `docker-e2e`.
- Check-run / status-check CONTEXT STRING a human selects in the branch-protection UI: **`docker e2e harness (real lore + backlog binaries)`** (the job's `name:`). No `matrix` on this job, so the context is exactly that string with no `(os)` suffix.
- Triggers: push to `[dev, main]` + unfiltered `pull_request`; runs-on `ubuntu-latest`.

### AC3 green-baseline confirmation: BLOCKED — cannot be produced right now
AC3 requires confirming a recent `docker-e2e` run on the target branch was GREEN before enforcement is enabled (so a red gate isn't flipped to required). **This is currently impossible, and the reason is NOT a code regression:**

- The last 300 CI runs (workflow `ci.yml`), spanning **2026-07-22 17:11 UTC -> 2026-07-23 22:37 UTC (~29 h)**, are **100% failures — zero successes** — across `dev` and every `feature/*` branch.
- On every run, all 7 jobs (the 3-OS `check` matrix, mkdocs/docusaurus/compile smokes, and `docker-e2e`) start and die within ~2-4 s having executed **0 steps**.
- Root cause is a GitHub **billing / spending-limit halt at the account level**. The failure annotation on each check run states verbatim: *"The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings."*
- Consequence: no `docker-e2e` run can go green — for any commit — until GitHub Actions billing is restored. Making `docker-e2e` (or any check) a REQUIRED status check while Actions is halted would **permanently block every merge**, because the required check can never report success.

### Revised human-only prerequisite chain (in order)
1. **[NEW, human, account billing]** Fix GitHub billing: update payment method / raise the Actions spending limit under Settings -> Billing & plans, so Actions jobs can start again. (This currently blocks ALL of CI on the whole repo, not just this task.)
2. **[human]** Push (or re-run) a CI build on `dev`; confirm a real `docker-e2e` run is GREEN. Record its run id/URL.
3. **[human, repo-admin]** For `dev` (and decide the same for `main`): create classic branch protection OR a repository ruleset, then add the required status check named `docker e2e harness (real lore + backlog binaries)`. OR record a deliberate keep-advisory decision with rationale (satisfies AC1/AC2 either way).
4. **[verify]** `gh api repos/jeremy-newhouse/lore/branches/dev/protection` (or `.../rulesets`) lists that context under `required_status_checks`.

### Ready-to-run reference for the human (make-required path, dev; classic protection)
```
# after billing is fixed AND a docker-e2e run on dev is confirmed green:
gh api -X PUT repos/jeremy-newhouse/lore/branches/dev/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=docker e2e harness (real lore + backlog binaries)' \
  -F 'enforce_admins=null' -F 'required_pull_request_reviews=null' -F 'restrictions=null'
# verify:
gh api repos/jeremy-newhouse/lore/branches/dev/protection --jq '.required_status_checks.contexts'
```
(Prefer the GitHub web UI Settings -> Branches -> Add rule if you want to also configure PR-review requirements at the same time. Whoever runs this is the human repo-admin performing the toggle per AC4 — the agent did not and must not run it.)

### Cross-reference / secondary observation
This billing outage also retroactively explains how round-3 `feature/*` branches merged with red CI: there is no branch protection (this task's raison d'etre), so red/again-halted CI never blocked those merges. Once billing is restored, the broader question of enforcing the `check` matrix and other CI jobs (not just `docker-e2e`) is worth deciding in the same settings pass.

## Required-check eligibility caveat (from LORE-251 review, 2026-07-23)

LORE-251 (PR #241) made the CI test matrix event-scoped: on `pull_request` only `check (ubuntu-latest)` and `check (windows-latest)` run; `check (macos-latest)` runs only on push-to-main / workflow_dispatch. Consequence for THIS task when a human configures branch protection:

- Eligible required-check contexts are ONLY: `docker e2e harness (real lore + backlog binaries)`, `lint · typecheck · test (ubuntu-latest)`, and `lint · typecheck · test (windows-latest)`.
- Do NOT mark `lint · typecheck · test (macos-latest)` required — it never materializes on a pull_request and would leave every PR's required check permanently pending (deadlock).
- Minor: a skipped `resolve test matrix` job also 'satisfies' a required check, so if any `check` leg is ever made required, make `resolve test matrix` required too. `docker-e2e` (the check this task actually plans to require) does not depend on resolve-matrix, so it is unaffected.

---

## Enforcement APPLIED (2026-07-24) — docker-e2e now a required check on dev [AC1/AC3]

The 2026-07-23 note above described the prep half and recorded AC3 as BLOCKED by a GitHub Actions account **billing halt**. That halt is now **RESOLVED** — Actions jobs run again and docker-e2e is green (evidence below) — so enforcement was applied.

### What was created
- **Repository ruleset** `require-docker-e2e-on-dev`, id **19698059**, `enforcement: active`, `target: branch`, condition `ref_name.include=["refs/heads/dev"]`.
- One rule `required_status_checks`: `strict_required_status_checks_policy: false`, required context = **`docker e2e harness (real lore + backlog binaries)`** (byte-exact, the only required check).
- `bypass_actors: [{actor_type: RepositoryRole, actor_id: 5 (Admin), bypass_mode: always}]` — the sole repo ADMIN (owner) can bypass, so the merge-queue's direct `git push origin dev` (tracker/archive commits) and dev→main fast-forwards keep working. This bypass is load-bearing: the current dev tip has 0 check-runs because LORE-251 removed the push-to-dev CI trigger, so a non-bypassed required check would permanently wedge direct pushes to dev.

### Enforcement confirmed present via API AFTER the change [AC1/AC3]
- `GET /repos/jeremy-newhouse/lore/rulesets/19698059` → rule params `{contexts: ["docker e2e harness (real lore + backlog binaries)"], strict: false}`.
- `GET /repos/jeremy-newhouse/lore/rules/branches/dev` → resolves `required_status_checks` with that context, `ruleset_id: 19698059` — i.e. the rule is live and effective for the `dev` ref.
- `GET /repos/jeremy-newhouse/lore/rules/branches/main` → `[]` (main deliberately unaffected — see AC2).

### docker-e2e confirmed GREEN before enforcement (so no red gate was flipped to required) [AC3]
- The content now on dev (`e99f2b6`, the LORE-251 squash merge) was verified green via its PR run **30092891454** (feature/LORE-251, pull_request, 2026-07-24): job `docker e2e harness (real lore + backlog binaries)` → **success**.
- Last dev-push docker-e2e run **30064226491** (2026-07-24 03:26): docker-e2e → **success**.
- The current dev tip `e99f2b6` itself has **no** docker-e2e run — not a failure, but because LORE-251 intentionally dropped the `push:[dev]` trigger; the required check reports on the PR-merge path, which is the intended enforcement point. The earlier (2026-07-23) 100%-failure window was the billing halt, now cleared.

### Eligibility (why only docker-e2e; confirmed against current ci.yml via a 4-agent adversarial verification) [context for AC1]
Six contexts run on every PR and are eligible: docker-e2e (green), `lint · typecheck · test (ubuntu-latest)` (green), `lint · typecheck · test (windows-latest)` (**RED** on both latest runs — excluded), `compile smoke (ubuntu)` (green), `mkdocs scaffold smoke` (green), `docusaurus scaffold smoke` (green). `lint · typecheck · test (macos-latest)` is INELIGIBLE (event-scoped to push/dispatch, never runs on a PR → would deadlock). Per the owner's decision, ONLY docker-e2e was required (minimal LORE-196 scope). Observation (not actioned — no task filed): the windows leg is currently failing on dev HEAD; worth a separate fix before it could ever be required.

### main decision [AC2]
Repo owner decided **dev only**: docker-e2e is intentionally **NOT** required on `main` at this time. Rationale: `main` is updated solely by fast-forward from `dev`, so every commit reaching main has already transited the dev PR path where docker-e2e is now a required gate; a main-level requirement would be redundant for the current solo FF workflow while adding friction to the dev→main push (owner-bypass would carry it). Revisit if main ever receives PRs directly or collaborators are added.

### Human authorization trail [AC4]
The ruleset was created by the assistant (`gh api POST`) **under the repo owner's explicit, per-configuration sign-off** — NOT self-authorized. The owner (sole repo ADMIN, viewerPermission=ADMIN) directed "proceed with LORE-196" and then explicitly selected, via a confirmation prompt: required checks = *docker-e2e only*, branch scope = *dev only*, apply method = *apply now via ruleset*. The assistant surfaced the exact check name, green-baseline confirmation, blast-radius analysis, and reversible drafts first; the owner made the governance decisions and authorized execution. Full rollback (one API call, returns dev to the pre-change unprotected state) recorded below.

### Rollback (if ever needed — true full reversal to today's unprotected state)
```
RULESET_ID=$(gh api /repos/jeremy-newhouse/lore/rulesets --jq '.[] | select(.name=="require-docker-e2e-on-dev") | .id')
gh api --method DELETE /repos/jeremy-newhouse/lore/rulesets/"$RULESET_ID"
```
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created repository ruleset 'require-docker-e2e-on-dev' (id 19698059, enforcement=active) making the check context 'docker e2e harness (real lore + backlog binaries)' a REQUIRED status check on the dev branch, with strict=false and a RepositoryRole/Admin(id 5)/always bypass so the owner-driven merge queue + dev→main pushes keep working. Verified live via GitHub API: GET /rules/branches/dev resolves the required_status_checks rule (ruleset_id 19698059) with exactly that context; main deliberately left unprotected (owner chose dev-only). docker-e2e confirmed GREEN before enforcement (LORE-251 PR run 30092891454 = the content now on dev, + dev-push run 30064226491), so no red gate was flipped to required; the prior all-red window was a since-resolved GitHub Actions billing halt. Executed by the assistant under the sole repo ADMIN's explicit per-config sign-off (proceed + apply-now/ruleset/docker-e2e-only/dev-only), not self-authorized. Full one-call rollback recorded in notes.
<!-- SECTION:FINAL_SUMMARY:END -->
