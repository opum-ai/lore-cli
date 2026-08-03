---
id: LCLI-253
title: >-
  Migrate backlog adapter to the released --json Backlog.md once upstream tags
  it (drop build-from-commit hint, bump version floor)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 00:16'
labels:
  - adapter-backlog
  - release
  - blocked-upstream
dependencies: []
references:
  - 'https://github.com/salient-data/lore-cli/pull/285'
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
- [ ] #3 docker/e2e/Dockerfile no longer pins BACKLOG_COMMIT=22a091b; it uses the released version/tag, and docker-e2e stays green against it.
- [x] #4 docs/runbooks/backlog-json-patch.md and README present the published-package install path as primary; the superseded fork/build-from-source content is clearly demoted or removed.
- [ ] #5 Full test suite and docker-e2e are green against the real released --json backlog.
- [x] #6 The .github/actions/strict-check/action.yml composite action no longer builds Backlog.md from a pinned commit on every run; it installs the published backlog.md>=1.49.0 instead
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/adapters/backlog.ts: bump MIN_BACKLOG_VERSION 1.47.1 -> 1.49.0 (first tagged MrLesk/Backlog.md release containing PR #790/BACK-545, released 2026-08-02); rewrite RUNBOOK_HINT to point at installing the published package instead of building commit 22a091b.
2. Update test fakes that hardcode a passing "1.47.1" --version response (test/backlog-probe.test.ts, test/backlog-adapter.test.ts, test/helpers.ts, test/init.test.ts) to a value >=1.49.0 so they still pass the floor check; leave the intentional below-floor test (1.46.9) alone.
3. docker/e2e/Dockerfile: replace the git-clone-and-compile-from-commit-22a091b step with installing backlog.md>=1.49.0 via npm; update its accompanying comments.
4. Update test/record-backlog-goldens-guards.test.ts and test/support/record-backlog-goldens.ts, which assert on / document the Dockerfile's pinned-commit mechanism, to match the new npm-install mechanism.
5. .github/actions/strict-check/action.yml: same swap as the Dockerfile (npm install instead of clone+compile from commit).
6. README.md and docs/runbooks/backlog-json-patch.md: update the "no tagged release yet" / pinned-commit language to present the published package as the (only) path; mark runbook SS8.1 step 4 complete.
7. bun test && bun run lint && bun run typecheck locally. Docker is not available in this execution environment, so docker-e2e cannot be run here -- will note that as an explicit limitation rather than claiming it green.
8. Record verification evidence in Implementation Notes, check ACs, final summary, move to Done per this repo's own task-finalization guide.
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
<!-- SECTION:NOTES:END -->
