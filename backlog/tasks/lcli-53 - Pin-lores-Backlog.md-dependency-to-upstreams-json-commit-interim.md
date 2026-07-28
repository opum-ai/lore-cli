---
id: LCLI-53
title: Pin lore's Backlog.md dependency to upstream's --json commit (interim)
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - backlog-fork
  - upstream
  - build
milestone: m-0
dependencies: []
documentation:
  - docs/runbooks/backlog-json-patch.md
  - docs/reference/backlog-cli-contract.md
priority: medium
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore adopts MrLesk/Backlog.md's own --json implementation (PR #790, BACK-545) instead of upstreaming the jeremy-newhouse/Backlog.md fork (LCLI-5). Since no tagged release contains that commit yet, wire lore's build/dependency to consume upstream's main branch pinned at or past the PR #790 merge commit (22a091b570d44c4f302ca47e7fd36fa28ad8bcb0) as an interim measure, and update the capability probe to recognize upstream's real envelope shape instead of the fork's. Once MrLesk/Backlog.md tags a release containing that commit, this pin is replaced by a normal semver dependency + a version-floor bump (a small follow-up, not tracked separately here).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore's documented build/install instructions (RUNBOOK_HINT in src/adapters/backlog.ts, and docs/runbooks/backlog-json-patch.md) point developers at building a --json-capable backlog binary from MrLesk/Backlog.md pinned at or past commit 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0, not the jeremy-newhouse/Backlog.md fork. No package.json dependency is added yet (deferred until a tagged release ships, since lore has not shipped and this is dev/test-time only).
- [x] #2 The capability probe's dry-run check (backlog task list --json) asserts upstream's real envelope shape (numeric schemaVersion: 1, kind: "task-list", a tasks array, not the fork's data key) and passes when run against a real, locally-built copy of the pinned commit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/adapters/backlog.ts — touch ONLY probeBacklog() and its immediate constants/types,
   not the shared EXPECTED_SCHEMA_VERSION/EnvelopeSchema/parseEnvelope that the rest of the
   adapter (listTasks/viewTask/searchTasks) still depends on for the fork's shape until
   LCLI-54's rewrite. Reusing EXPECTED_SCHEMA_VERSION for the probe would flip it project-wide
   and break real reads + the golden fixture tests, which are explicitly LCLI-54's scope.
   - Add a probe-only schema-version constant (numeric, e.g. PROBE_SCHEMA_VERSION = 1),
     separate from the exported (string) EXPECTED_SCHEMA_VERSION.
   - TASK_LIST_KIND: "taskList" -> "task-list" (already probe-isolated).
   - Step 3 of probeBacklog: destructure `tasks` (not `data`) from the envelope; assert
     Array.isArray(tasks); update the fail-loud message wording accordingly.
   - BacklogCapability.schemaVersion field type: string -> number.
   - RUNBOOK_HINT: rewrite to point at building/using upstream MrLesk/Backlog.md pinned at
     commit 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 (interim, no tagged release yet),
     replacing the old "build the fork" instruction.
   - Update the file header comment + probeBacklog's docstring to say the probe now targets
     upstream, while EXPECTED_SCHEMA_VERSION/EnvelopeSchema below still target the fork
     pending LCLI-54.
2. test/backlog-probe.test.ts — update the envelope() helper and every call site to build/
   assert upstream's shape (kind "task-list", `tasks` key, numeric schemaVersion). Flip the
   "wrong kind" test (today pins camelCase as correct, hyphenated as wrong — inverts).
3. test/helpers.ts:256 — fake probe's canned schemaVersion "1" -> 1 (number), matching the
   new BacklogCapability type.
4. Docs, via lore (not raw edits):
   - docs/reference/backlog-cli-contract.md §5 — rewrite step 4 + the "targets the fork"
     banner to reflect the probe now checks upstream's shape; note MIN_BACKLOG_VERSION is
     unchanged (still a non-discriminating sanity floor) and that a package.json dependency
     is deliberately deferred until a tagged release ships (user decision: lore hasn't
     shipped yet, so build/test against a manually-built pinned-commit binary for now).
   - docs/runbooks/backlog-json-patch.md §8.1 step 2 — replace the "future git dependency"
     language with the actual decision: no package.json entry yet; document the manual
     build-and-PATH convention (mirroring §6, repointed at upstream's pinned commit instead
     of the fork). Step 4 (real semver dependency once a tag ships) is unchanged.
   - docs/reference/backlog-json-schema.md §8 — no change needed (already accurate).
5. Verify: bun test (probe suite + helpers-dependent suites), bun run typecheck, lore check.
6. Record notes on LCLI-53: the probe-only-constant split rationale, and the confirmed
   decision to skip package.json wiring until a tagged upstream release ships.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per plan. src/adapters/backlog.ts: probeBacklog now targets upstream's real envelope
(new exported PROBE_SCHEMA_VERSION=1 (number), TASK_LIST_KIND="task-list", step 3 reads `tasks`
not `data`), kept fully separate from the exported EXPECTED_SCHEMA_VERSION/EnvelopeSchema/
parseEnvelope (still this fork's string "1"/`data` shape) which LCLI-54 owns -- confirmed by
tracing every call site (grep) before changing anything, so this doesn't collaterally touch
listTasks/viewTask/searchTasks. RUNBOOK_HINT now points at building upstream pinned at
22a091b570d44c4f302ca47e7fd36fa28ad8bcb0. No package.json dependency added (confirmed via
git diff --stat package.json -- clean), per the user's explicit decision this session: docs/
convention only for now (RUNBOOK_HINT + docs/runbooks/backlog-json-patch.md manual clone/build/
PATH instructions), no package.json wiring until a tagged upstream release ships -- lore hasn't
shipped yet so this is dev/test-time-only.

Real end-to-end verification (not just fake-spawn unit tests): cloned MrLesk/Backlog.md into
scratch, checked out 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 (git log -1 confirmed), `bun
install`, ran the interpreted CLI (`bun src/cli.ts`, same technique as
test/support/record-backlog-goldens.ts, since this repo checkout is on the external volume where
`bun build --compile` silent-fails per prior LCLI-4 notes) for real `--version` (from upstream's
own checkout dir, since their getVersion() falls back to reading package.json from cwd only when
uncompiled/no embedded build-time version -- first attempt used the wrong cwd and misleadingly
read LORE's own package.json "0.0.0" instead of upstream's real "1.48.0"; corrected and
re-verified) and real `task list --json` (from this repo's own cwd, against this repo's real
backlog/ tasks). Fed both real outputs through the actual (updated) probeBacklog() via a throwaway
script -- PASSED: {"version":"1.48.0","schemaVersion":1}. Real `task list --json` output confirmed
byte-for-byte the documented upstream shape: {"schemaVersion":1,"kind":"task-list","tasks":[...]}.
Script deleted after verification (was never committed).

Test harness fix (test/backlog-adapter.test.ts): probeBacklog's dry-run and a real listTasks()
read issue the IDENTICAL `["task","list","--json"]` argv, so the shared fake-spawn harness's single
canned response for that argv could not satisfy both the new upstream-shaped probe check and the
still-fork-shaped read parser at once. Fixed by having `defaultProbe` serve an upstream-shaped
envelope only to the first such call (always the probe's own memoized dry-run, per the code's
"every method runs the probe first" contract) and the old fork-shaped TASK_LIST golden to any
later one (a real read, LCLI-54 territory) -- verified this holds for every test in the file
(re-traced each describe block's own script fn to confirm none silently relied on the old
shared-golden assumption).

Docs updated directly (not via lore, since these are prose-only edits to existing reference/
runbook docs with no Story/Task coupling or structural change -- confirmed via `lore check`
after, still 37 files/0 errors/0 warnings): docs/reference/backlog-cli-contract.md §5 (probe now
targets upstream; MIN_BACKLOG_VERSION explicitly noted as unchanged/still non-discriminating, and
the "no package.json dependency yet" decision recorded); docs/runbooks/backlog-json-patch.md §8.1
step 2 (replaced the never-implemented "future git dependency" language with the actual decision).

Verification: bun test (1484 pass, 0 fail), bun run typecheck (clean), bun run lint (clean, 4
pre-existing infos unrelated to this change), bun run lore check (37 files, 0 errors/0 warnings),
plus the real-upstream-binary probe pass described above.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Migrated the capability probe (src/adapters/backlog.ts's probeBacklog) from this fork's --json envelope shape to upstream's real shape (PR #790): new PROBE_SCHEMA_VERSION=1 (number), TASK_LIST_KIND="task-list", tasks-array parsing, all kept separate from the full adapter's still-fork-shaped EXPECTED_SCHEMA_VERSION/EnvelopeSchema (LCLI-54). RUNBOOK_HINT and docs/runbooks/backlog-json-patch.md now point developers at building upstream pinned at commit 22a091b; no package.json dependency added, per explicit user decision to defer real dependency wiring until a tagged release ships. Verified against a real, locally-built copy of the pinned commit (cloned, checked out, bun install, ran interpreted), not just fake-spawn unit tests: probeBacklog passed with {version:"1.48.0", schemaVersion:1} against genuine upstream output. bun test (1484 pass), typecheck, lint, and lore check (37 files/0 errors) all clean.
<!-- SECTION:FINAL_SUMMARY:END -->
