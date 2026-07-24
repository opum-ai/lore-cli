---
id: LORE-251
title: >-
  Reduce CI Actions minute cost: event-scoped OS matrix, concurrency
  cancellation, drop redundant push:dev
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-24 03:13'
updated_date: '2026-07-24 03:14'
labels:
  - build-ci-config
dependencies: []
references:
  - LORE-196
  - LORE-100
  - doc-2
priority: medium
type: chore
ordinal: 353000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome

Restructure `.github/workflows/ci.yml` so a normal PR or push costs materially fewer *billed* GitHub Actions minutes, without losing the verification that matters (ubuntu correctness on every PR, cross-OS + e2e on integration).

## Why it matters

A forensic audit of `jeremy-newhouse/lore` (ci.yml) found the Actions bill was driven by campaign-scale volume multiplied by a structurally expensive per-run pipeline, which overran the account's included-minute allotment and tripped a **billing spending-limit halt on 2026-07-22** (300+ runs since then were startup-rejected at ~0 min — see LORE-196 notes for the halt detail).

Measured facts (per-job wall-clock reconstructed with GitHub's billing rules — each job rounds up to a whole minute; macOS x10, Windows x2, Linux x1; the `/timing` API returned 0):

- **806 CI runs** in ~1 month; ~503 actually billed. 217 runs on 2026-07-23 alone (the LORE-2xx wave campaign).
- **~20 weighted billed-min per run** in the historical 6-job era (~25 now with docker-e2e).
- **The macOS `check` leg is ~50% of per-run cost**: ~40s of real test work billed as 1 min x10 = 10 weighted min — a ~15x inflation (rounding x multiplier).
- **No `concurrency` cancellation** — superseded pushes each ran the whole pipeline to completion.
- **444 redundant `push: dev` runs** re-verifying bytes the PR already checked (`push:[dev,main]` + unfiltered `pull_request` double-triggers each task).
- **No path filtering** — docs/backlog-only changes paid full compute.

## Scope

Config-only change to `.github/workflows/ci.yml` (plus, if needed, small notes). No application-code or test changes. Must stay compatible with LORE-196 (make `docker-e2e` a required status check): the `docker-e2e` job must keep its exact check-run name and keep running on every PR, and `pull_request` must NOT be paths-ignore'd (a required check skipped by a path filter deadlocks the PR).

## Deliberate non-goals (note, don't do here)

- Docker buildx layer cache for `docker-e2e` (bigger change; docker-e2e is ubuntu x1 and ~5 min, lower leverage) — leave as a follow-up.
- pip/npm caches for the scaffold smokes — the deps are inline / in a *generated* `website/`, so setup-python/setup-node built-in caching can't key on a lockfile that doesn't exist at setup time; skip rather than add a broken cache.

## References

- LORE-196 (docker-e2e required-check task — interaction), LORE-100 (wired docker-e2e into CI), LORE-8 (original CI), doc-2 (Codex review).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The macOS (10x-billed) 'check' test leg no longer runs on pull_request events; it runs only on push to main and manual workflow_dispatch. ubuntu-latest and windows-latest still run 'check' on every pull_request.
- [ ] #2 A top-level concurrency group with cancel-in-progress: true, keyed per PR head-ref / ref, is present so superseded runs on the same branch are auto-cancelled.
- [ ] #3 The push trigger no longer includes dev (main only), so a squash-merge to dev does not re-run CI on bytes the PR already verified; pull_request still runs full CI pre-merge.
- [ ] #4 push is paths-ignore'd for docs/metadata-only changes (**/*.md, docs/**, backlog/**, .claude/**). pull_request is intentionally left unfiltered so the docker-e2e required check (LORE-196) always reports and cannot deadlock a PR.
- [ ] #5 The docker-e2e job's check-run context name is unchanged ('docker e2e harness (real lore + backlog binaries)') and it still runs on every pull_request, preserving LORE-196's required-check plan.
- [ ] #6 Every job declares an explicit timeout-minutes (no job inherits the 360-minute default).
- [ ] #7 actionlint passes on the modified workflow, and the computed matrix resolves to [ubuntu,windows] for pull_request and [ubuntu,windows,macos] for push/workflow_dispatch.
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
