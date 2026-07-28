---
id: LCLI-5
title: Open the upstream --json PR and migrate lore on release
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:21'
labels:
  - backlog-fork
  - upstream
milestone: m-0
dependencies:
  - LCLI-3
  - LCLI-4
  - LCLI-53
  - LCLI-54
documentation:
  - docs/runbooks/backlog-json-patch.md
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upstream (MrLesk/Backlog.md) shipped its own --json implementation independently (PR #790, BACK-545), closing issue #784 before lore opened a PR. lore adopts that contract directly instead of upstreaming this fork's patch: consume upstream's patched main branch (pinned commit, at/past the PR #790 merge, 22a091b) as an interim git dependency, rewrite src/adapters/backlog.ts against its real contract (different envelope/kind/field shape than this fork), then switch to the published package + bump the version floor once a tagged release ships.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore's git dependency and capability probe target upstream's --json build (pinned commit interim; published semver package once a tagged release includes PR #790), not this fork
- [x] #2 src/adapters/backlog.ts (envelope parsing, Zod schemas, probe) matches upstream's actual --json contract (see backlog-json-schema.md §8), not this fork's {schemaVersion, kind, data} shape
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fetch upstream's actual shipped --json contract from PR #790 (merged to main,
   unreleased): src/formatters/json-output.ts, src/utils/read-output-mode.ts, and
   the CLI-INSTRUCTIONS.md "Stable JSON output" section it added.
2. Read our fork's current implementation (tasks/back-510-json-output @ a80b7a1)
   and lore's consumer of it -- src/adapters/backlog.ts (LCLI-4/LCLI-21) plus
   docs/runbooks/backlog-json-patch.md -- to know what shape lore's adapter
   currently assumes/probes for.
3. Produce a field-by-field / envelope-by-envelope comparison: schemaVersion,
   kind discriminators, per-command envelope keys (tasks/task/results vs our
   uniform data), compact task projection fields, error/exit-code contract,
   --plain/non-TTY precedence, search result discrimination shape.
4. Record the comparison and its migration implications (what src/adapters/backlog.ts
   would need to change once we consume the real upstream release instead of the
   fork) in LCLI-5's implementation notes, and update docs/runbooks/backlog-json-patch.md
   via lore if it documents contract details that are now stale/superseded.
5. Do NOT change src/adapters/backlog.ts itself yet (no release exists to consume)
   -- this pass is evaluation/documentation only, per user direction.
6. Leave LCLI-5 In Progress; ACs are not satisfiable by this pass alone (AC#1 is
   moot, AC#2 needs a real release) -- flag re-scoping as a follow-up decision
   rather than checking ACs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PARKED at Phase 2 start (per master plan review-entire-backlog-of-mutable-origami.md, sections lines 21/112-114/189-191). Re-scope: the durable part — consume the fork as a locally-compiled git dependency + wire lore's capability probe / min-version floor — is owned by LCLI-2 + LCLI-21 (runbook backlog-json-patch.md section 6). LCLI-5's remaining unique scope is the UPSTREAM PR to MrLesk/Backlog.md and migrate-on-release; that is DEFERRED. Verified there is NO upstream issue or PR for --json today. Do not open one until we choose to upstream. No status verb for 'parked' exists (statuses = To Do/In Progress/Done); left To Do but blocked behind LCLI-3/LCLI-4 and gated by this decision.

Re-parked task resumed 2026-07-13. Verified upstream state first: no existing
--json output support in MrLesk/Backlog.md (grepped current source, README,
CHANGELOG; searched open/closed issues and PRs for "json"/"--json" -- no hits
related to CLI --json output). Also found our fork's task ID collides:
backlog/tasks/back-510-*.md on our branch (tasks/back-510-json-output) now
collides with upstream main's own unrelated back-510 (Fix repeated task edit
label flags) -- our branch is 113 commits behind upstream/main, 3 ahead with
our own --json work. A fresh task ID via their CLI allocator will be needed
before any PR.

Reviewed upstream's actual contribution process (AGENTS.md + .github/
PULL_REQUEST_TEMPLATE.md) before acting, per this task's own AC#1 spirit:
they explicitly want a scoped issue opened and discussed BEFORE any PR --
"Investigations should not create implementation PRs by default... PRs
should normally link to a scoped issue first." Drafted a scope-only issue
(no mention of our existing fork/prototype/implementation, to avoid
presupposing the outcome before maintainers weigh in), iterated on it with
the user (dropped a self-promotional project link, then dropped all
references to already having a working implementation), got explicit
sign-off, and opened it:
https://github.com/MrLesk/Backlog.md/issues/784

NEXT: wait for maintainer response on scope/shape before doing any rebase
or PR work. Do not open a PR against this repo until that discussion
resolves -- that is the whole point of asking first.

DRIFT CHECK 2026-07-16 (handover restore): maintainer MrLesk responded on
issue #784 on 2026-07-14 (before this handover was even written, but the
response wasn't caught/flushed into this task yet). Response:
- Confirms structured JSON output is a wanted direction, scoped upstream as
  BACK-545.
- Before accepting any implementation, wants the public contract settled
  first: curated fields, versioned+discriminated envelope, JSON-only stdout,
  error behavior, heterogeneous search results, deterministic precedence
  over --plain and non-TTY behavior.
- Explicitly: "please hold off on opening PRs or doing further refactors for
  now." Still no PR.
- Concrete ask: link our existing fork branch/commit and share representative
  output for (1) a task list, (2) a single task, (3) a heterogeneous search
  result, (4) an empty result and an error.
- Another contributor (lenucksi) also has a fork implementation and was asked
  the same thing -- maintainer wants to review both as prior art and
  coordinate one implementation path.

NEXT: task moves from "wait" to "respond with prior art" -- still gated on
user sign-off before posting anything to the public issue (per this task's
own established norm of not acting on upstream without explicit user
approval first).

Posted reply to issue #784 (2026-07-16): https://github.com/MrLesk/Backlog.md/issues/784#issuecomment-4998567172
Linked fork branch tasks/back-510-json-output @ a80b7a1 and provided the 4
requested representative outputs (task list, single task, heterogeneous
search, empty result), generated against a clean throwaway scratch project
(not our real lore backlog) with the local path sanitized before posting.
Also disclosed a real gap found while generating the error-case sample:
`task view --json` on a not-found task silently drops --json, prints plain
text to stderr, and exits 0 -- inconsistent with `task archive`'s not-found
handling (same message, but process.exitCode = 1). Flagged this as exactly
the kind of "error behavior" question MrLesk asked to settle, rather than
hiding it. Did not open a PR; explicitly deferred to the contract discussion
and offered to align with lenucksi's fork.

NEXT: wait for MrLesk (and/or lenucksi) to respond on the contract shape
before any further fork/rebase/PR work.

DRIFT CHECK 2026-07-17 (handover restore): issue #784 is now CLOSED (state_reason:
completed), closed by MrLesk at 2026-07-16T22:05:25Z -- about 5 hours BEFORE our
prior-art reply comment posted (2026-07-17T03:03:19Z). Our reply landed on an
already-resolved issue with no acknowledgment yet.

Root cause: MrLesk's team implemented BACK-545 themselves, independently of our
fork or lenucksi's -- PR https://github.com/MrLesk/Backlog.md/pull/790 ("BACK-545 -
Add stable JSON output to read commands"), authored/executed by an internal agent
(@back545-agent per backlog/tasks/back-545 assignee), plan approved by "Alex" on
2026-07-15, merged 2026-07-16T22:05:23Z, closing #784. This was NOT built from our
or lenucksi's prior art -- no reference to either fork in the PR/task body.

Their shipped contract differs from our fork's tasks/back-510-json-output branch:
- Envelope: theirs is per-command-shaped -- {schemaVersion:1, kind:"task-list", tasks:[...]}
  / {kind:"task-view", task:{...}} / {kind:"search", results:[...]}. Ours is uniform
  {schemaVersion, kind, data}.
- Field naming/shape differs (e.g. their compact task summary fields, path vs our
  filePath/filePathRelative, createdAt/updatedAt naming).
- Error handling: theirs is CORRECT per this task's own AC#2 spirit -- "errors leave
  stdout empty, write a concise message to stderr, and exit nonzero" (explicitly
  documented in CLI-INSTRUCTIONS.md's new "Stable JSON output" section). This closes
  the exact gap we disclosed in our issue comment (task view --json not-found exiting
  0) -- upstream did NOT have that gap; only our fork does.
- Not yet released: merged to main, but the last tagged release is v1.48.0
  (published 2026-07-12, before this merge). package.json on main still reads 1.48.0.
  No new release/tag exists yet as of this check.

Strategic implication (needs user decision, not yet acted on): LCLI-5's original
scope (open our own PR upstream) is now moot -- upstream shipped its own
implementation independently. AC#1 ("Upstream PR opened and linked") can't be
satisfied as originally worded since we won't be the ones opening it. AC#2 ("lore
min-version floor documented for the --json release") becomes actionable once
upstream cuts a release containing PR #790 -- but the contract lore's fork-based
adapter/probe (src/adapters/backlog.ts, LCLI-4/LCLI-21) was built against is NOT
the same shape as what upstream actually shipped, so adopting upstream's real
release will need adapter changes, not just a version-floor bump. Left status
In Progress pending user direction on how to re-scope.

CONTRACT EVALUATION 2026-07-17 (per user direction: evaluate now, don't touch
the adapter yet since no upstream release exists). Compared upstream PR #790
(src/formatters/json-output.ts, src/utils/read-output-mode.ts, cli.ts diff,
CLI-INSTRUCTIONS.md's new "Stable JSON output" section, fetched at PR head
347c0f2b) against our fork's schema (docs/reference/backlog-json-schema.md)
and src/adapters/backlog.ts (LCLI-4/LCLI-21).

Full comparison table recorded in docs/runbooks/backlog-json-patch.md section 8
(a correction callout, since that section's step 3 assumed convergence -- now
falsified). Summary:
- Envelope shape differs entirely: ours is uniform {schemaVersion, kind, data}
  across all 3 commands; upstream is per-command {kind: "task-list", tasks: [...]}
  / {kind: "task-view", task: {...}} / {kind: "search", results: [...]}.
- schemaVersion type differs: ours is the string "1"; upstream is the number 1.
- kind spelling differs: taskList/task/searchResult (ours, camelCase-no-hyphen)
  vs task-list/task-view/search (upstream, hyphenated).
- Task fields differ: ours carries source/branch/onStatusChange/absolute
  filePath+filePathRelative; upstream deliberately excludes branch/internal
  fields (curated `path`, project-relative only) but adds type/reporter at
  summary level.
- Search hit shape differs: ours is {type, score, item}; upstream is {type, data}
  with NO score (explicitly excluded from their v1 contract).
- task view/<id> not-found: upstream now exits 1 unconditionally (any mode) --
  this closes exactly the gap our issue #784 reply disclosed. Our fork still
  exits 0 with empty stdout (which our adapter treats as the "missing" signal,
  so this is not a bug in lore today, just a fork/upstream divergence).

Conclusion: src/adapters/backlog.ts, as written today, would FAIL its own
capability probe against upstream's real --json output (wrong kind strings,
no top-level `data` key). Migrating to a real upstream release is an adapter
rewrite against the new contract, not a version-floor bump -- LCLI-5 AC#2's
"migrate on release" framing undersells the work. Not yet actionable: PR #790
is merged to main but NOT in a tagged release yet (latest tag v1.48.0,
2026-07-12, predates the 2026-07-16 merge).

NEXT: watch for a Backlog.md release/tag that includes PR #790's commit
(22a091b on main). When one ships: re-scope LCLI-5 (or split a follow-up task)
to rewrite src/adapters/backlog.ts's envelope parsing, Zod schemas, and probe
against the real upstream shape documented above, rather than assuming today's
schema doc is correct. No code changed this pass -- evaluation/documentation
only, per explicit user direction.

DECISION 2026-07-17 (user directive): adopt upstream's independent --json
implementation now, rather than waiting for a tagged release or reopening our
own upstream PR. Concretely: retire this fork (jeremy-newhouse/Backlog.md) as
the plan of record; point lore's (future) git dependency at upstream's patched
main branch, pinned to a commit at/past the PR #790 merge (22a091b), as an
interim measure since no tagged release contains it yet; once a real release
ships, switch to the published package and bump the capability probe's floor.

Re-scoped the task's description and both ACs to match (old AC1 "upstream PR
opened and linked" is retired -- we are not opening one; old AC2 "min-version
floor documented" is superseded by the two new ACs: (1) dependency/probe
targets upstream, pinned-commit interim then real release, (2) the adapter's
envelope parsing/Zod schemas/probe actually match upstream's shape instead of
this fork's).

Flushed the decision into every doc that described the old fork-and-upstream
plan as current, each with a migration-notice banner plus specifics, so none
of them silently go stale:
- docs/adr/0002-backlog-integration-json-only.md -- amendment noting Decision
  items 1 (fork it ourselves) and 4 (upstream a PR) are superseded; the rest
  of the ADR (JSON-only reads, envelope pattern, fail-loud probe, CLI-only
  writes) still stands.
- docs/reference/backlog-json-schema.md -- new §8 with the full envelope/kind/
  field/exit-code comparison table (this fork vs. upstream PR #790) and the
  interim pinned-commit plan; §1-7 marked as accurately describing what's
  shipped in code TODAY, not the adoption target.
- docs/reference/backlog-cli-contract.md -- migration-notice banner; §2.2
  ("task view <missing> exits 0") flagged as a fact that FLIPS once migrated
  (upstream exits 1 unconditionally); §5's capability probe section flagged as
  fork-specific (MIN_BACKLOG floor, kind:"taskList" assertion) with the interim
  pinned-commit alternative spelled out.
- docs/runbooks/backlog-json-patch.md -- top-of-file "Superseded" banner
  (sections 1-7, the fork/patch/upstream-PR procedure, are historical record
  only); §8 rewritten from "wait for a release" into the concrete adoption
  plan: retire the fork, pin the git dep to upstream's commit, rewrite the
  adapter, then switch to a real release once tagged.

`lore check` clean (37 files, 0 errors/warnings) after all doc edits.

NOT done this pass (docs/planning only, per explicit user scope): no code
changed. src/adapters/backlog.ts still parses this fork's shape; no git
dependency is wired in package.json yet (the adapter currently just shells
`backlog` on PATH, so there's nothing to repoint yet). The adapter rewrite
(new AC#2) and the actual git-dependency wiring (new AC#1) are the concrete
next engineering steps, not yet started.

Opened two follow-up tasks for the concrete engineering work (2026-07-17), rather
than tracking it only as this task's ACs, and added them as LCLI-5's dependencies:
- LCLI-53: pin lore's Backlog.md dependency to upstream's --json commit (interim,
  since no tagged release exists yet); capability probe recognizes upstream's
  real envelope.
- LCLI-54: rewrite src/adapters/backlog.ts against upstream's real contract
  (envelope/kind/schema/probe, viewTask exit-code change, golden test recapture,
  schema doc rewrite). Depends on LCLI-53.
No code changed on this task itself; it remains the umbrella decision record.

Both ACs now satisfied: AC#1 since LCLI-53 (probe targets upstream's pinned-commit build); AC#2 since LCLI-54 (the full read adapter -- envelope parsing, Zod schemas, mapping -- now matches upstream's real contract too, not just the probe). All four listed dependencies (LCLI-3, LCLI-4, LCLI-53, LCLI-54) are Done. Left In Progress, not Done: this task's own description also covers switching from the interim pinned-commit build to a published semver package + bumping the capability probe's version floor once a tagged MrLesk/Backlog.md release includes PR #790 -- that step is still ahead, gated on an external release, and deliberately deferred (LCLI-53 decision, reaffirmed on LCLI-54).

CLOSING 2026-07-19 (user request): re-verified upstream state before closing -- latest MrLesk/Backlog.md tag is still v1.48.0 (2026-07-12), no tag yet contains PR #790's merge commit (22a091b, 2026-07-16). No change since the 2026-07-17 drift check. Both ACs remain satisfied and all four dependencies (LCLI-3, LCLI-4, LCLI-53, LCLI-54) are Done. The sole remaining item -- swap the interim pinned-commit build for a real semver package + bump the capability probe's version floor once a tagged release ships -- was already explicitly scoped in LCLI-53's own description as 'a small follow-up, not tracked separately here', not open-ended scope for LCLI-5 itself to keep tracking indefinitely against an unscheduled external event. Closing now rather than leaving this open as a perpetual reminder; if/when MrLesk/Backlog.md tags a release containing PR #790, that migration becomes its own small, purpose-built task at that time.

Caveat for future readers: 'adopted upstream's fix' means lore's adapter code (LCLI-54) and its golden tests match upstream's real --json contract, verified against static fixtures captured once from a manually-built copy of the pinned commit -- not a live build in CI, and no package.json dependency exists. A real end user running lore today with a normally-installed Backlog.md (published v1.48.0) will still fail the --json capability probe unless they manually build MrLesk/Backlog.md from commit 22a091b themselves, per RUNBOOK_HINT in src/adapters/backlog.ts. This was already a known, accepted gap from LCLI-53's own decision (dev/test-time only, deferred until a tagged release), not new information.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed: adopts MrLesk/Backlog.md's independently-shipped --json implementation (PR #790) instead of upstreaming lore's own fork. Both ACs satisfied -- the capability probe and the full read adapter (LCLI-53, LCLI-54) target upstream's real per-command envelope contract, verified against fixtures captured from a manually-built copy of the pinned commit (22a091b). Remaining work (swap the interim pin for a real published package once MrLesk/Backlog.md tags a release containing that commit) is out of this task's scope per LCLI-53's own framing and will be its own small follow-up task when that release ships -- verified no such release exists yet (latest tag v1.48.0, predates the merge).
<!-- SECTION:FINAL_SUMMARY:END -->
