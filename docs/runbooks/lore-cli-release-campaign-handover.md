---
type: Runbook
title: Lore CLI release campaign handover
tags:
  - handover
  - campaign
  - release
  - ladybugdb
summary: Durable atomic-task cursor, verification record, blockers, and next-session handoff for the full-featured Lore CLI release campaign.
timestamp: 2026-07-30T22:02:50Z
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
- **Current atomic cursor:** no task is activated. `LCLI-283.1.2` is complete;
  indexed routing remains a separate, not-started session.
- **Cursor status:** `LCLI-283.1.2` is Done after objective verification.
- **Dependency state:** `LCLI-283.1.1`, `LCLI-283.1.2`, and `LCLI-284` are
  Done. Parent `LCLI-283.1` remains To Do and must not be finalized before all
  four children qualify.
- **Last completed atomic task:** `LCLI-283.1.2`.
  - Exact native package: `@ladybugdb/core@0.18.2`;
  - runtime/storage versions: `0.18.2` / `42`;
  - implementation remains in the focused-session worktree for review; no push,
    PR, merge, tag, or publication was performed.
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
- **LCLI-283.1.2 starting HEAD:**
  `603c68378ebec295aeb4ad7d5298ebc2d8d734e6`.
- **LCLI-284 activation/plan HEAD:**
  `ec32a85d2b11754db5738ff32049bca603509626`.
- **LCLI-284 final Backlog HEAD:**
  `222d177`. The implementation and this handover are in the immediately
  following campaign closeout commit.
- **Published branch:** `feature/lcli-284-commander`. GitHub rejected a direct
  `dev` push with `GH013` because both required status checks are expected, so
  the verified closeout was published on this feature branch without changing
  repository rules.
- **origin/dev:** matches the starting HEAD with zero divergence after PR #266
  merged.
- **Published Commander branch:** `feature/lcli-284-commander` remains at
  `a6348ff8971c5ad4f9a43aedb62643e70fc09deb`.
- **Worktree:** contains only the focused LCLI-283.1.2 implementation,
  verification tests, dependency metadata, Backlog record, and campaign
  documentation. Reinspect with `git status --short --branch`; do not reset,
  rebase, or discard.
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

- **Code:** LCLI-283.1.3, LCLI-283.1.4, and the remaining M7–M8 sequence are
  not complete. LCLI-283.1.2 and LCLI-284 have no remaining code or
  documentation blocker.
- **Upstream:** LCLI-253 requires a tagged Backlog.md release newer than the
  currently identified v1.48.0 and containing the stable JSON contract.
- **Operator:** LCLI-278 requires a decision for GitHub release-environment
  protection. The existing `release` environment has no effective required
  reviewer protection under the current plan.
- **Protected-branch gate:** future publication of LCLI-283.1.2 still requires
  the repository's normal checked PR flow. No rule bypass, GitHub settings
  change, push, PR, merge, tag, npm publish, or public version selection was
  performed in this session.

## Exact next action

Review and land the focused LCLI-283.1.2 implementation through the normal
checked branch/PR flow. Only in a separately authorized implementation session,
re-run the mandated Backlog/Lore startup and activate `LCLI-283.1.3`; both of
its prerequisite lanes are now Done. Do not begin LCLI-283.1.4, advance the
parent, or enter M7/M8/MCP scope in that session.

## Recovery

If a session ends mid-task, do not clean blindly. Read this runbook and the live
Backlog record, inspect Git status/log, and continue only the current atomic
task. Preserve all local commits. If the worktree contains unrelated changes,
separate or work around them instead of discarding them.

## Paste-ready continuation prompt

```text
Work directly in /Volumes/external/repos/lore-cli.
Read AGENTS.md completely and run backlog instructions overview before any
action. Then read backlog instructions task-execution, the Lore skill,
lore instructions, and
docs/runbooks/lore-cli-release-campaign-handover.md. Preserve the focused
LCLI-283.1.2 implementation and inspect the live repository, Backlog, and
protected-branch state before changing anything. Verify LCLI-283.1.2 is Done,
LCLI-283.1 remains To Do, and no later child was activated. Review and land the
focused implementation through the normal checked branch/PR flow only when
separately authorized; do not bypass repository rules. Then, in a separate
focused implementation session, activate only LCLI-283.1.3 after re-running the
mandated startup and confirming both prerequisites remain Done. Use pinned
/Users/jdnewhouse/.bun/bin/bun 1.2.23. Do not begin LCLI-283.1.4, explorer,
M7/M8, MCP, Confluence, typed-library, hosted-graph, release, tagging, or npm
publishing scope. Do not rewrite history, change GitHub settings, or advance a
parent before all children qualify.
```
