---
id: LCLI-253
title: >-
  Migrate backlog adapter to the released --json Backlog.md once upstream tags
  it (drop build-from-commit hint, bump version floor)
status: Done
assignee:
  - '@codex'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - adapter-backlog
  - release
  - blocked-upstream
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
references:
  - src/adapters/backlog.ts
  - docs/runbooks/backlog-json-patch.md
  - 'https://github.com/MrLesk/Backlog.md/pull/790'
  - 'https://github.com/salient-data/lore-cli/pull/285'
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: high
type: task
ordinal: 355000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Once MrLesk/Backlog.md tags a release NEWER than v1.48.0 whose history contains commit 22a091b (PR #790 / BACK-545, stable --json output, merged 2026-07-16), migrate lore off the interim build-from-source flow to the published package. This is the single load-bearing, currently-untracked step gating lore's own first npm release.

## Why it matters
lore's adapter (src/adapters/backlog.ts) requires a --json-capable backlog. Today MIN_BACKLOG_VERSION is still 1.47.1 (the fork floor) and the RUNBOOK_HINT (~line 201) tells users to BUILD MrLesk/Backlog.md from commit 22a091b because no tagged release contains it yet. docker/e2e/Dockerfile pins BACKLOG_COMMIT=22a091b. LCLI-53's notes call this migrate-on-release swap a small follow-up 'not tracked separately' — so it has no task. Until it lands, lore cannot cut a clean first release (users can't just install a released backlog).

## Blocked on
An external event: MrLesk/Backlog.md tagging a release greater than v1.48.0 that includes commit 22a091b. Track that via the companion upstream-tag watch task. Not startable until then.

## Context
docs/runbooks/backlog-json-patch.md section 8.1; docs/runbooks/release-publishing.md Prerequisites; the LCLI-5 'Superseded' note (upstream shipped its own --json).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MIN_BACKLOG_VERSION in src/adapters/backlog.ts is raised from 1.47.1 to the tagged release version that ships --json, and the capability probe passes against the real PUBLISHED backlog binary.
- [x] #2 The RUNBOOK_HINT no longer instructs building from commit 22a091b; it points at installing the published backlog.md at or past that release version.
- [x] #3 docker/e2e/Dockerfile no longer pins BACKLOG_COMMIT=22a091b; it uses the released version/tag, and docker-e2e stays green against it.
- [x] #4 docs/runbooks/backlog-json-patch.md and README present the published-package install path as primary; the superseded fork/build-from-source content is clearly demoted or removed.
- [x] #5 Full test suite and docker-e2e are green against the real released --json backlog.
- [x] #6 The .github/actions/strict-check/action.yml composite action no longer builds Backlog.md from a pinned commit on every run; it installs the published backlog.md>=1.49.0 instead
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep MIN_BACKLOG_VERSION at 1.49.0, the first tagged JSON-capable release, and keep the published-package installation hint.
2. Qualify the declared minimum directly: pin the Docker E2E harness and published strict-check action to backlog.md 1.49.0, then update the version-pin guard test.
3. Replace the remaining stale pinned-build comments in docker/e2e/run-e2e.sh with exact published-package language.
4. Preserve all source, runbook, upstream, and delivery references in the Backlog task.
5. Run focused tests, lint, typecheck, strict documentation checks, and diff hygiene; commit and push the review corrections to PR #285.
6. Require replacement CI to pass at the exact amended head. Then check ACs #3 and #5 and write the evidence-backed final summary, while leaving LCLI-253 In Progress until the exact PR head is authorized and merged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Related workflow gap surfaced during local testing (2026-07-24)

'backlog task create' has no machine-readable id output: the upstream --json PR (#790) added JSON only to the READ commands (task list / view / search), NOT to create. So the create->link round-trip (e.g. lore's own e2e and any 'create a task then couple it to a Story' flow) must fall back to 'backlog task list --json | .tasks[0].id', which is fragile on a bundle that already has tasks (the newest isn't reliably first). Two possible fixes to weigh when this migration lands:
- Upstream: request/track 'backlog task create --json' (emit the created id) — the clean fix, belongs with the adapter migration.
- lore-side convenience: a 'lore link --create-task "<title>"' (or 'lore new task') that creates the backlog task AND couples it in one step, so the id never has to be round-tripped by the caller.
Not blocking this task; captured here so it is considered alongside the version-floor/adapter work rather than lost.

2026-08-02. Implemented per plan. Verified:

- bun test: 2201 pass, 0 fail (full suite, including the rewritten test/backlog-probe.test.ts,
  test/backlog-adapter.test.ts, test/helpers.ts, test/init.test.ts fakes bumped off the 1.47.1
  floor, and the version-pin-based test/record-backlog-goldens-guards.test.ts).
- bun run lint: clean (biome).
- bun run typecheck: clean (tsc --noEmit).
- REAL end-to-end proof against the actual released binary, not a test fake: this dev machine's
  `backlog` on PATH is genuinely backlog.md@1.49.1 (upgraded fleet-wide as the sibling remote-mgmt
  RMGMT-61 task). Ran `bun src/cli.ts orphans --json` and `bun src/cli.ts tasks LCLI-253 --json`
  directly against it -- both exercised the real capability probe (MIN_BACKLOG_VERSION=1.49.0) and
  the real read adapter (listTasks) against the genuine v1.49.1 envelope, not a fixture. orphans
  returned the live LCLI-* task rollup; tasks correctly reported LCLI-253 as an unlinked concept
  (a real, different code path, not a probe failure). This is materially stronger evidence than
  the unit tests alone, which only prove the code handles the *documented* upstream shape.
- `bun src/cli.ts check --strict`: 41 files, 0 errors, 0 warnings, after all the doc edits (README,
  backlog-json-patch.md, backlog-json-schema.md, backlog-cli-contract.md, test/fixtures/README.md).

NOT verified here -- Docker is unavailable in this execution environment:
- AC#3's "docker-e2e stays green" against the rewritten Dockerfile (git-clone-and-compile-from-commit
  replaced with `npm install -g backlog.md@1.49.1`) is unverified. The Dockerfile logic was reviewed
  carefully (nodejs/npm are already installed earlier in the same image for the docusaurus scaffold
  step, so no new package install phase was needed) but never actually built.
- AC#5's "docker-e2e are green" has the same gap.
Both need a real CI run (this repo's ci.yml presumably runs the e2e Dockerfile) before being
considered proven -- recommend verifying on the PR before merge rather than trusting this notes
paragraph.

Extra scope beyond the original ACs (same fork-cleanup category, added as AC#6): the published
`.github/actions/strict-check/action.yml` composite action, which built Backlog.md from the pinned
commit on every single invocation, now does `bun install --global backlog.md@1.49.1` instead.
Also touched three reference docs outside the original AC list that made now-false present-tense
claims ("PR #790 is merged but not yet in a tagged release", "MIN_BACKLOG_VERSION... remains 1.47.1"):
docs/reference/backlog-json-schema.md and docs/reference/backlog-cli-contract.md. Did not attempt a
full re-verification of backlog-cli-contract.md's detailed CLI-behavior-at-specific-commits claims
against v1.49.0 source -- that document's deep verification (exact source line numbers, flag
behavior diffs) is out of this task's scope; only the specific claims that referenced the fork
floor/pinned-commit state were corrected.

PR #285 opened against dev: https://github.com/salient-data/lore-cli/pull/285. Task stays In Progress until CI's docker-e2e job confirms AC#3/#5 -- do not move to Done on the strength of local verification alone.

2026-08-03 pre-merge review remediation authorized by the user. Restore references lost by replacement-field mutation, qualify the declared 1.49.0 floor against the real published binary instead of only 1.49.1, correct stale harness comments, and keep terminal task closure after verified merge.

Pre-merge review remediation local evidence on minim4: the exact published backlog.md@1.49.0 binary reports 1.49.0 and successfully drives bun src/cli.ts orphans --json through the real capability probe and list adapter. The focused version-pin guard suite passes 17/17; the full Bun suite passes 2201/2201 with 6279 expectations; Biome checks 118 files clean; TypeScript passes; strict Lore validation and coherence checks pass for 41 docs with 0 errors and 0 warnings; bash -n, compiled build, and git diff --check pass. Docker E2E at the amended head remains gated on replacement PR CI.

GitHub CI run 30779634457 passed all eight required jobs at exact reviewed head ca70bab627f0e2ba2a393221cc9a06ad41151cf0. Docker E2E completed successfully in 4m57s while installing and exercising published backlog.md@1.49.0, directly proving AC #3 and the real-binary portion of AC #5. Ubuntu and Windows full test jobs, compile smoke, both documentation scaffold smokes, three-engine explorer qualification, and Ladybug benchmark smoke also passed. PR #285 is open, mergeable, and CLEAN. Task intentionally remains In Progress until this exact head is authorized and merged.

User authorized merge on 2026-08-03. PR #285 merged exact reviewed head 5b879782560be6ab6107096eeef2c5e07d2e3a61 into dev as merge commit 7a5e775e424100700867f6e1a3a3d448ccdb03f6 at 2026-08-03T13:05:45Z. Final exact-head CI run 30779888983 passed all eight jobs, including Windows and Docker E2E against published backlog.md@1.49.0. Delivery state is now satisfied; this settlement marks LCLI-253 Done.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Migrated Lore from the interim pinned-commit Backlog.md build to the published JSON-capable package, set the adapter floor and operator guidance to 1.49.0, installed the exact published minimum in Docker E2E and the strict-check action, preserved PATH-based adapter ownership, and updated tests and documentation. Verified locally with 2201 tests, lint, typecheck, build, strict Lore checks, and a direct backlog.md@1.49.0 adapter smoke. Final GitHub CI run 30779888983 passed all eight jobs at exact head 5b87978, including Windows and real Docker E2E. PR #285 merged that exact head into dev as 7a5e775.
<!-- SECTION:FINAL_SUMMARY:END -->
