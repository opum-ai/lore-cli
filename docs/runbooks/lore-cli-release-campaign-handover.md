---
type: Runbook
title: Lore CLI release campaign handover
tags:
  - handover
  - campaign
  - release
  - ladybugdb
summary: Durable atomic-task cursor, verification record, blockers, and next-session handoff for the full-featured Lore CLI release campaign.
timestamp: 2026-07-31T00:20:13Z
---

# Lore CLI release campaign handover

## Purpose

Carry the full-featured Lore CLI campaign across focused sessions without
losing the atomic Backlog cursor, unpublished local history, contract
decisions, verification evidence, or release blockers. The active scope is M6
LadybugDB indexing, Commander, M7 explorer, M8 indexed capabilities, and release
qualification. Local MCP, Confluence, the typed library, hosted graph services,
and wider private-beta work remain held.

## Campaign state and cursor

- **Campaign state:** Active.
- **Current atomic cursor:** `LCLI-283.1.3` implementation and objective
  verification are complete, and the separate landing review passed after
  three in-scope corrections. The reviewed local commit awaits separately
  authorized protected publication.
- **Cursor status:** `LCLI-283.1.3` is Done with all four acceptance criteria
  checked. `LCLI-283.1.4` remains To Do and was not activated.
- **Dependency state:** `LCLI-283.1.1`, `LCLI-283.1.2`, and `LCLI-284` are
  Done. Parent `LCLI-283.1` remains To Do and must not be finalized before all
  four children qualify.
- **Last completed atomic task:** `LCLI-283.1.3`.
  - `graph`, lexical `query`, and `context` route through a verified immutable
    Ladybug generation on supported hosts;
  - the in-memory loader remains the conformance oracle and automatic fallback;
  - the addon stays behind the lazy native boundary, with Windows native
    qualification deferred to `LCLI-283.1.4`;
  - no push, PR, merge, tag, publication, or GitHub setting change occurred.
- **Completed prerequisite:** `LCLI-283.1.2`.
  - Exact native package: `@ladybugdb/core@0.18.2`;
  - runtime/storage versions: `0.18.2` / `42`;
  - implementation commit: `edbd6f3`;
  - Windows test-boundary follow-up: `4018a65`;
  - landed through PR #267 at merge commit
    `9df6186f6b93312153a40ef8bdaf3648f0e801f7`.
- **Closed prior campaign:** the dependency-boundary campaign remains closed
  and must not be reactivated.

## Repository state

- **Branch:** `dev`. Completed local campaign branches were pruned after their
  commits were verified as ancestors of `dev`:
  `feature/lcli-283-1-1-ladybug-contract`,
  `feature/lcli-285-string-width`, `feature/lcli-286-ipaddr-js`,
  `feature/lcli-287-github-slugger`, and
  `feature/lcli-288-zod-config-shape`. Unrelated branches and the linked
  `feature/wave2-integration-fixes` worktree were left untouched.
- **Protected baseline:** `origin/dev` remains
  `9df6186f6b93312153a40ef8bdaf3648f0e801f7`, the PR #267 merge commit. Local
  `dev` contains the Backlog activation/plan commit `a6fd4d6` and finalization
  commit `1b80389`, the landing-review evidence synchronization commit
  `8c6b764`, and the reviewed focused implementation, documentation, and
  closeout commit at the local branch tip. After that commit, local `dev` is
  four commits ahead of `origin/dev`.
- **Published LCLI-283.1.2 branch:**
  `feature/lcli-283-1-2-ladybug-lifecycle` ends at `4018a65`.
- **Published Commander branch:** `feature/lcli-284-commander` remains at
  `a6348ff8971c5ad4f9a43aedb62643e70fc09deb`; PR #266 is merged.
- **Worktree:** clean after the reviewed `LCLI-283.1.3` commit. Preserve its
  four unpublished local commits; do not reset, rebase, amend, squash, or
  discard them.
- **Linked worktree:** `feature/wave2-integration-fixes` remains untouched at
  `f11164b`.
- **Pinned runtime:** `/Users/jdnewhouse/.bun/bin/bun` 1.2.23. Do not count
  evidence from another Bun version.

## Decisions later tasks must preserve

- Index format is `ladybug-projection/1`; validated export schema `1.0` is the
  only ingestion boundary.
- Every manifest, trailer, concept, task, and authored edge is losslessly
  represented. Each authored edge is its own node so duplicate ordinals and
  dangling targets survive. Canonical source JSON retains additive/unknown
  fields.
- Stable export record keys remain the source identities. Repository scope,
  snapshot, bundle, commit, export, task-snapshot, path/target, and record
  provenance are retained; Ladybug internal ids never enter public output.
- Storage is repository-local and content-addressed below
  `.lore/cache/graph/ladybug/1/`. Published generations are immutable and
  read-only.
- One exclusive writer builds an isolated generation, closes/reopens it for
  verification, writes the control manifest last, and publishes by atomic
  directory rename. It never mutates a generation that readers can open.
- Reuse requires immutable generation-directory, control-manifest, and database
  permissions. Writable published artifacts are rejected. Cleanup failure for
  abandoned staging is advisory and cannot block a new isolated build.
- Ordered classification distinguishes `locked`, `unsupported`, `corrupt`,
  `rebuildable`, and `reusable`. M6 migration is rebuild-only; newer unsupported
  indexes are preserved and corruption cleanup requires exclusive ownership.
- No lifecycle path writes repository sources. No vectors, embeddings, model
  calls, inferred edges, public Cypher, hidden global graph, AuraDB, or local
  MCP enters M6.
- The official native package is exact `@ladybugdb/core@0.18.2`. Bun 1.2.23
  reports Ladybug runtime `0.18.2` and storage version `42`; both are recorded
  and cause rebuild on change. Wider platform packaging/benchmark qualification
  remains for LCLI-283.1.4.
- Bun 1.2.23 segfaults while loading the Ladybug Windows addon. Indexed routing
  must keep the addon behind an explicit lazy boundary so unsupported and
  fallback paths do not import it. Non-native contracts still run on Windows;
  native Windows qualification remains `LCLI-283.1.4` scope.
- CLI parsing and routing use exact `commander@15.0.0` from the capability
  manifest. Lore retains generated help, injected writers, `LoreError`
  translation, JSON envelopes, semantic exits, TTY/`NO_COLOR`, and process
  lifecycle; indexed routing must extend this boundary rather than add another
  parser.

The detailed frozen contract is in
[ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md)
and its sequence-level summary is in the
[local graph platform roadmap](../specs/local-graph-platform-roadmap.md).

## Verification record

### LCLI-283.1.3

LCLI-283.1.3 implementation and landing review completed on 2026-07-30:

- Shared indexed/reference plus affected command/lifecycle tests: 238 passed,
  0 failed, 678 assertions across 6 files. The dedicated conformance file
  covers JSON/plain/pretty parity, errors, ordering, lexical ties and filters,
  graph depth, context budgets, truncation, internal provenance, Unicode,
  duplicates, dangling and additive records, empty/boundary inputs, every
  lifecycle fallback/rebuild state, no partial output, no source writes, and
  public native-detail exclusion. A source-snapshot retry now also proves that
  only the successful attempt's reference warnings are emitted.
- Full `/Users/jdnewhouse/.bun/bin/bun test`: 2,296 passed, 0 failed, 6,662
  assertions across 54 files.
- Launcher/release/flush/local-contract tests: 25 passed, 0 failed, 102
  assertions across 5 files.
- `/Users/jdnewhouse/.bun/bin/bun run lint`: 126 files clean;
  `/Users/jdnewhouse/.bun/bin/bun run typecheck`: clean.
- Source version and JSON-version checks passed. The compiled build contained
  241 modules; compiled version checks passed, and compiled
  `query`/`graph`/`context` created and reused a real repository-local
  Ladybug generation on the supported Darwin host.
- Frozen install checked 98 installs across 109 packages with no changes.
  Package dry-run contained 70 files / 1.38 MB unpacked. `bun audit` found no
  vulnerabilities.
- The automatic resolver decides reuse, rebuild, preservation, fallback, or
  failure before command emission. Native read failures discard private
  warnings/details and fall back before stdout; newer unsupported generations
  are preserved; corrupt data is quarantined only under ownership; exact
  verified generations remain reusable under a live writer lock.
- The CLI, lifecycle classifier, unsupported paths, reference fallback, and
  Windows policy do not evaluate `@ladybugdb/core`. Native Windows packaging
  support was neither claimed nor attempted.
- Landing review corrected three in-scope boundary defects: newer control
  formats are preserved before this version applies its immutable-permission
  rules; native-loader/runtime failures fall back without quarantining an
  otherwise valid generation; and an abandoned source-snapshot attempt no
  longer leaks duplicate advisories into the successful indexed result.
- The review environment's pre-existing installed package tree lacked the
  copied `lbugjs.node`; the exact trusted package install script restored it
  from the locked Darwin package without changing source or the lockfile.
  Final frozen install, native tests, and compiled smoke passed. Clean-install
  and wider platform qualification remain `LCLI-283.1.4` scope.

### LCLI-283.1.2

LCLI-283.1.2 startup, implementation, and verification completed on
2026-07-30:

- Required Backlog and Lore instructions, task/dependency state, frozen ADR,
  roadmap, handover, Git/worktree state, and official Ladybug package/API were
  inspected before implementation.
- Official package research verified exact `@ladybugdb/core@0.18.2`, MIT
  license, five exact platform optional dependencies, parameterized statements,
  ACID transactions, `CHECKPOINT`, explicit close, and read-only reopen.
- Landing review corrected the immutable-publication interruption boundary,
  made abandoned-staging cleanup advisory as frozen, and removed a duplicated
  native-driver header. A post-publication interruption now proves the complete
  generation is immutable and reusable; writable generation/control/database
  artifacts are never served.
- Focused lifecycle/projection/contract tests: 20 passed, 0 failed, 143
  assertions.
- Full `/Users/jdnewhouse/.bun/bin/bun test`: 2,265 passed, 0 failed, 6,591
  assertions across 53 files.
- `/Users/jdnewhouse/.bun/bin/bun run lint`: 123 files clean.
- `/Users/jdnewhouse/.bun/bin/bun run typecheck`: clean.
- `/Users/jdnewhouse/.bun/bin/bun run build`: 229 modules compiled;
  source and compiled version/JSON-version checks passed.
- A standalone compiled native smoke created, checkpointed, closed, reopened
  read-only, and queried a Ladybug `0.18.2` database successfully.
- Frozen-lock install was unchanged; package dry-run contained 68 files / 1.36
  MB unpacked; `bun audit` found no vulnerabilities.
- Source-no-write, Git-ignore, deterministic semantic rebuild/reuse,
  changed/deleted replacement, duplicate/dangling/additive record,
  interruption, native/control corruption, stale/live lock,
  unsupported-format preservation, rebuild-only compatibility, immutable
  permission, disposal, and symlink-containment cases passed.
- PR #267 passed all six checks: Docker E2E, Windows and Ubuntu
  lint/typecheck/test, compile smoke, MkDocs scaffold smoke, and Docusaurus
  scaffold smoke.
- Final repository audit found no tracked or present cache/native-database
  artifacts. Local and remote `dev` matched at the merge commit with a clean
  worktree; the linked Wave 2 worktree remained untouched.

LCLI-284 startup, implementation, and verification completed on 2026-07-30:

- `backlog instructions overview` and
  `backlog instructions task-execution`: read.
- `lore instructions` plus `linking`, `sync`, `check`, and `validation`: read.
- Required live task, parent, dependency, roadmap, release, architecture,
  dependency-handover, CLI, and projection records: inspected.
- `docs/README.md` does not exist in the live repository; root `README.md` and
  `docs/index.md` are the available entry points.
- `git rev-parse HEAD origin/dev`:
  `484353d8d8a973aa24d6e429525c489fe44daca3` and
  `1afd3bba89dd0f43a7a6a13cab90fe916e018c58`.
- `git rev-list --left-right --count origin/dev...dev`: `0 26`.
- `/Users/jdnewhouse/.bun/bin/bun --version`: `1.2.23`.
- Official Commander repository/package metadata: verified `commander@15.0.0`,
  MIT license, zero runtime dependencies, and the documented
  `exitOverride()`/output-configuration contracts.
- Focused CLI/help/agent tests: 123 passed, 0 failed, 873 assertions.
- Full:
  `/Users/jdnewhouse/.bun/bin/bun test` — 2,252 passed, 0 failed, 6,500
  assertions across 52 files.
- `/Users/jdnewhouse/.bun/bin/bun run lint` — 119 files clean.
- `/Users/jdnewhouse/.bun/bin/bun run typecheck` — clean.
- `/Users/jdnewhouse/.bun/bin/bun run build` — 229 modules compiled;
  `./dist/lore --version` — `0.0.0`; the compiled JSON usage-error seam passed.
- `/Users/jdnewhouse/.bun/bin/bun pm pack --dry-run --ignore-scripts` —
  package contents verified with no tarball written.
- Distribution-focused launcher/release/smoke tests — 18 passed, 0 failed.
- `/Users/jdnewhouse/.bun/bin/bun audit` — no vulnerabilities; installed
  Commander metadata reports MIT and no dependencies.
- `lore sync` — Backlog final state committed and generated bundle files
  reconciled.
- `lore validate --strict` and `lore check --strict` — 46 concepts, 0 errors,
  0 warnings.
- `git diff --check` — clean.
- Closeout: committed the complete LCLI-284 implementation and handover.
  Direct `dev` publication was correctly blocked by required checks, so the
  exact state was pushed to `feature/lcli-284-commander`. Remote-tracking refs
  were fetched with prune semantics, and only the five merged local campaign
  branches identified in the repository state above were deleted.

## Remaining blockers

- **Code:** LCLI-283.1.4 and the remaining M7–M8 sequence are not complete.
  LCLI-283.1.2, LCLI-283.1.3, and LCLI-284 have no remaining implementation or
  documentation blocker.
- **Upstream:** LCLI-253 requires a tagged Backlog.md release newer than the
  currently identified v1.48.0 and containing the stable JSON contract.
- **Operator:** LCLI-278 requires a decision for GitHub release-environment
  protection. The existing `release` environment has no effective required
  reviewer protection under the current plan.
- **Protected-branch gate:** LCLI-283.1.2 is fully landed. Any future
  LCLI-283.1.3 publication must use the normal checked PR flow. No rule bypass,
  GitHub settings change, tag, npm publish, or public version selection is
  authorized by this handover.

## Exact next action

When protected publication is separately authorized, branch from the reviewed
local `dev` tip, push that exact history to a focused feature branch, and open
the normal checked PR to `dev`. Wait for required checks and report them. Do not
merge, activate `LCLI-283.1.4`, advance the parent, or enter M7/M8/MCP scope in
that session.

## Recovery

If a session ends mid-task, do not clean blindly. Read this runbook and the live
Backlog record, inspect Git status/log, and continue only the current atomic
task. Preserve all local commits. If the worktree contains unrelated changes,
separate or work around them instead of discarding them.

## Paste-ready continuation prompt

```text
Work directly in /Volumes/external/repos/lore-cli.

This session is exclusively for protected publication, when separately
authorized, of the completed and landing-reviewed LCLI-283.1.3 change, "Route
graph query and context through indexed retrieval." Do not implement or
activate LCLI-283.1.4, advance parent LCLI-283.1, or begin later campaign scope.

Before any action:

1. Read AGENTS.md completely.
2. Run `backlog instructions overview`.
3. Read `backlog instructions task-finalization`.
4. Read `.codex/skills/lore/SKILL.md` completely.
5. Run `lore instructions`.
6. Read docs/index.md, ADR-0018, the local graph platform roadmap, this campaign
   handover, and the live LCLI-283.1, LCLI-283.1.2, LCLI-283.1.3,
   LCLI-283.1.4, and LCLI-284 records.
7. Inspect Git status/history, branches, worktrees, remote refs, and relevant
   GitHub PR state. Treat live state as authoritative and stop on unexplained
   dirt, divergence, rewritten history, changed prerequisites, or an unrelated
   active task.

Expected baseline:

- origin/dev remains at the PR #267 merge
  9df6186f6b93312153a40ef8bdaf3648f0e801f7;
- local dev is four commits ahead: Backlog activation/plan commit a6fd4d6,
  finalization commit 1b80389, landing-review evidence synchronization commit
  8c6b764, and the focused reviewed implementation/docs commit at the branch
  tip;
- the primary worktree is clean;
- PR #267 merged with all six checks successful;
- LCLI-283.1.2, LCLI-283.1.3, and LCLI-284 Done;
- LCLI-283.1.3 has all four acceptance criteria checked and objective evidence
  in its implementation notes/final summary;
- LCLI-283.1.4 and parent LCLI-283.1 To Do;
- linked feature/wave2-integration-fixes worktree untouched at f11164b.

The landing review is complete; do not rewrite or recompute the reviewed
history. Reconfirm the clean worktree, exact divergence, live origin/dev, task
states, active ruleset, and absence of an overlapping PR. If the current user
request explicitly authorizes protected publication, create a focused feature
branch at the local dev tip, push it, open the normal PR to dev, and wait for
required checks. Do not bypass protection.

Preserve history and unrelated branches/worktrees. Do not reset, rebase, amend,
squash, clean, discard, merge, tag, select a release version, publish npm
packages, or change GitHub settings. Finish with branch/commit state, PR/check
state, task/parent state, the untouched linked worktree, publication actions
not taken, and work deferred exclusively to LCLI-283.1.4.
```
