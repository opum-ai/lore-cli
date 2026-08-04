---
id: LCLI-251
title: >-
  Reduce CI Actions minute cost: event-scoped OS matrix, concurrency
  cancellation, drop redundant push:dev
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - build-ci-config
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
references:
  - LCLI-196
  - LCLI-100
  - doc-2
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: medium
type: chore
ordinal: 353000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome

Restructure `.github/workflows/ci.yml` so a normal PR or push costs materially fewer *billed* GitHub Actions minutes, without losing the verification that matters (ubuntu correctness on every PR, cross-OS + e2e on integration).

## Why it matters

A forensic audit of `jeremy-newhouse/lore` (ci.yml) found the Actions bill was driven by campaign-scale volume multiplied by a structurally expensive per-run pipeline, which overran the account's included-minute allotment and tripped a **billing spending-limit halt on 2026-07-22** (300+ runs since then were startup-rejected at ~0 min — see LCLI-196 notes for the halt detail).

Measured facts (per-job wall-clock reconstructed with GitHub's billing rules — each job rounds up to a whole minute; macOS x10, Windows x2, Linux x1; the `/timing` API returned 0):

- **806 CI runs** in ~1 month; ~503 actually billed. 217 runs on 2026-07-23 alone (the LCLI-2xx wave campaign).
- **~20 weighted billed-min per run** in the historical 6-job era (~25 now with docker-e2e).
- **The macOS `check` leg is ~50% of per-run cost**: ~40s of real test work billed as 1 min x10 = 10 weighted min — a ~15x inflation (rounding x multiplier).
- **No `concurrency` cancellation** — superseded pushes each ran the whole pipeline to completion.
- **444 redundant `push: dev` runs** re-verifying bytes the PR already checked (`push:[dev,main]` + unfiltered `pull_request` double-triggers each task).
- **No path filtering** — docs/backlog-only changes paid full compute.

## Scope

Config-only change to `.github/workflows/ci.yml` (plus, if needed, small notes). No application-code or test changes. Must stay compatible with LCLI-196 (make `docker-e2e` a required status check): the `docker-e2e` job must keep its exact check-run name and keep running on every PR, and `pull_request` must NOT be paths-ignore'd (a required check skipped by a path filter deadlocks the PR).

## Deliberate non-goals (note, don't do here)

- Docker buildx layer cache for `docker-e2e` (bigger change; docker-e2e is ubuntu x1 and ~5 min, lower leverage) — leave as a follow-up.
- pip/npm caches for the scaffold smokes — the deps are inline / in a *generated* `website/`, so setup-python/setup-node built-in caching can't key on a lockfile that doesn't exist at setup time; skip rather than add a broken cache.

## References

- LCLI-196 (docker-e2e required-check task — interaction), LCLI-100 (wired docker-e2e into CI), LCLI-8 (original CI), doc-2 (Codex review).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The macOS (10x-billed) 'check' test leg no longer runs on pull_request events; it runs only on push to main and manual workflow_dispatch. ubuntu-latest and windows-latest still run 'check' on every pull_request.
- [x] #2 A top-level concurrency group with cancel-in-progress: true, keyed per PR head-ref / ref, is present so superseded runs on the same branch are auto-cancelled.
- [x] #3 The push trigger no longer includes dev (main only), so a squash-merge to dev does not re-run CI on bytes the PR already verified; pull_request still runs full CI pre-merge.
- [x] #4 push is paths-ignore'd for docs/metadata-only changes (**/*.md, docs/**, backlog/**, .claude/**). pull_request is intentionally left unfiltered so the docker-e2e required check (LCLI-196) always reports and cannot deadlock a PR.
- [x] #5 The docker-e2e job's check-run context name is unchanged ('docker e2e harness (real lore + backlog binaries)') and it still runs on every pull_request, preserving LCLI-196's required-check plan.
- [x] #6 Every job declares an explicit timeout-minutes (no job inherits the 360-minute default).
- [x] #7 actionlint passes on the modified workflow, and the computed matrix resolves to [ubuntu,windows] for pull_request and [ubuntu,windows,macos] for push/workflow_dispatch.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add top-level concurrency { group: workflow-headref/ref, cancel-in-progress: true } (AC2).
2. Triggers: on.push.branches [dev,main]->[main] + paths-ignore (**/*.md, docs/**, backlog/**, .claude/**); keep pull_request UNFILTERED; add workflow_dispatch (AC3/AC4).
3. New 'resolve-matrix' ubuntu job: emit os=[ubuntu,windows] for pull_request, [ubuntu,windows,macos] otherwise; 'check' consumes fromJSON(needs.resolve-matrix.outputs.os) so macOS (10x) is off the per-PR path (AC1/AC7).
4. Add explicit timeout-minutes to every job incl. the new resolve-matrix (AC6).
5. Leave docker-e2e job name + its unconditional pull_request run untouched (AC5).
6. Validate: actionlint on ci.yml; reason through matrix resolution per event (AC7). Cannot rely on live CI (billing-halt) — validate statically.
7. Adversarial review (Fable/codex) of the diff; fix findings; then check ACs + final summary.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Verification (2026-07-23)

Live CI could not be used to verify — GitHub Actions is halted account-wide on a billing spending-limit failure (see LCLI-196 notes). Verified statically instead:

- `actionlint 1.7.12` clean on the modified `.github/workflows/ci.yml` (exit 0).
- resolve-matrix logic executed locally for each event: pull_request -> `["ubuntu-latest","windows-latest"]`; push & workflow_dispatch -> `["ubuntu-latest","windows-latest","macos-latest"]` (both valid JSON arrays parseable by fromJSON). Proves AC1/AC7.
- YAML parse confirms: `on.push.branches=['main']`, `push.paths-ignore=['**/*.md','docs/**','backlog/**','.claude/**']`, `pull_request` unfiltered, `workflow_dispatch` present, top-level `concurrency`. Proves AC3/AC4/AC2.
- `docker-e2e` job `name:` byte-identical to dev's (`diff` IDENTICAL) and the job has no event/path gating -> runs on every pull_request. Proves AC5.
- 6 jobs, each with explicit `timeout-minutes` (5/20/15/15/20/45). Proves AC6.
- `lore check` clean (38 files, 0 errors, 0 warnings) after the runbook edit.

## Adversarial review

Two independent reviewers ran on commit 88eb8eb:

- Fable (GHA-semantics skeptic): **approve, 0 blocking**. Verified actionlint, branch-protection APIs (404/no rulesets), docker-e2e name byte-compare, release.yml interplay.
- Codex gpt-5.6-sol (xhigh): 2 findings, no blocking correctness bug.

Both independently flagged the concurrency key. Addressed in commit f41cbd6:
- Key PR runs by `github.event.pull_request.number` (unique) instead of `github.head_ref` (collides across two-base / fork PRs, could cancel an unrelated PR's required docker-e2e check).
- Gate `cancel-in-progress` to `pull_request` events only, so a main-integration push or manual full-matrix dispatch is never cancelled and keeps its green status.
- Codex P3: synced `docs/runbooks/docker-e2e-testing-environment.md` ('pushes to dev/main' -> 'pushes to main') via `lore replace`.

## Accepted tradeoffs (from review, deliberately not changed)

- Dropping `push: dev` means a direct code push straight to `dev` (no PR) now gets zero CI; a PR that went stale against dev is only integration-verified at the next dev->main ff-push. Bounded: the repo pushes only metadata (backlog commits) directly to dev, and the merge-queue does rebase+re-verify. This is the intended cost saving, not a regression.
- `push` paths-ignore only skips *re-verification* of docs/backlog bytes the unfiltered `pull_request` leg already verified pre-merge; it never skips first verification.

## Forward caveat recorded on LCLI-196

Only the ubuntu/windows `check` legs and `docker-e2e` are eligible *required* status-check contexts. `check (macos-latest)` must NOT be marked required — it doesn't materialize on `pull_request` and would deadlock every PR. (A skipped `resolve-matrix` also satisfies a required check, so if a `check` leg is ever made required, make `resolve test matrix` required too.)

## Code-review pass (/code-review max #241, 2026-07-24)

Workflow-backed multi-agent review (6 finders + 13 verifiers): 12 verified findings, 0 refuted. Applied --fix:

FIXED (8):
- concurrency group fallback github.ref -> github.run_id, so push/workflow_dispatch runs each get a unique group and are never cancelled or left pending-then-superseded (GitHub cancels QUEUED runs in a shared group even with cancel-in-progress:false). Fixes the dispatch/push-collide and unprotected-pending-main-run findings.
- Inlined the OS matrix as a fromJSON(event=='pull_request' ...) expression and DELETED the resolve-matrix job — removes the needs: dependency that could skip/deadlock the (soon-required) check legs, the redundant billed runner, and a stale 'dev push' comment. actionlint clean; resolves ubuntu+windows on PR, +macos on push/dispatch (unchanged behavior).
- docker-e2e timeout 45m->20m (~4x the measured ~5m) and reconciled the self-contradicting comment.
- Runbook: qualified the 'pushes to main' trigger line with the paths-ignore carve-out; fixed the '## CI gate (required, since LCLI-100)' heading to 'not yet a *required* check — see LCLI-196'.

SKIPPED — intended tradeoffs (fixing would revert the cost saving / change AC intent):
- macOS excluded from PR matrix (the point of the change; documented).
- direct pushes to dev now run zero CI (accepted; PR-based flow + merge-queue re-verify).
- push paths-ignore skips scaffold jobs on a docs-only *direct* main push (bounded by the same accepted direct-push tradeoff; PRs still run scaffolds).

NO CHANGE NEEDED (1):
- check (macos-latest) not a required-check-eligible context — no code fix possible without defeating the purpose; already documented in LCLI-196's notes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restructured .github/workflows/ci.yml to cut billed Actions minutes: event-scoped OS matrix (macOS 10x leg off the per-PR path via a resolve-matrix job), top-level concurrency with PR-scoped cancel-in-progress, push trigger [dev,main]->[main] to drop redundant post-merge runs, and docs/backlog paths-ignore on push (pull_request left unfiltered to keep the docker-e2e required check from deadlocking). docker-e2e name + per-PR run preserved (LCLI-196). All 7 ACs verified statically (actionlint clean, resolve-matrix simulated per event, YAML parsed) since live CI is billing-halted; Fable review approve/0-blocking + Codex gpt-5.6 both passed, their shared concurrency-key finding fixed. Estimated ~40-50% off a typical run's weighted minutes.
<!-- SECTION:FINAL_SUMMARY:END -->
