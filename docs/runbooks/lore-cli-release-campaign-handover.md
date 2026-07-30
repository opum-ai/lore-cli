---
type: Runbook
title: Lore CLI release campaign handover
tags:
  - handover
  - campaign
  - release
  - ladybugdb
summary: Durable atomic-task cursor, verification record, blockers, and next-session handoff for the full-featured Lore CLI release campaign.
timestamp: 2026-07-30T20:06:36Z
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
- **Current atomic cursor:** no task is activated. `LCLI-284` is complete; the
  next independent M6 lane is `LCLI-283.1.2`, which was deliberately not
  started in the Commander-focused session.
- **Cursor status:** `LCLI-284` is Done after objective verification.
- **Dependency state:** `LCLI-283.1.1` and `LCLI-284` are Done. Parent
  `LCLI-283.1` remains To Do and must not be finalized before all four children
  qualify.
- **Last completed atomic task:** `LCLI-284`.
  - Backlog activation/plan commit: `ec32a85`;
  - final Backlog state commit: `222d177`;
  - implementation and campaign handover are committed by the closeout commit
    that follows `222d177`.
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
- **Campaign starting HEAD:** `484353d8d8a973aa24d6e429525c489fe44daca3`.
- **LCLI-284 activation/plan HEAD:**
  `ec32a85d2b11754db5738ff32049bca603509626`.
- **LCLI-284 final Backlog HEAD:**
  `222d177`. The implementation and this handover are in the immediately
  following campaign closeout commit.
- **origin/dev:** synchronized to local `dev` by the authorized campaign
  closeout push.
- **LCLI-284 starting divergence:** local `dev` was 30 commits ahead and 0
  behind.
- **Checkpoint divergence:** local `dev` and `origin/dev` match after the
  campaign closeout push.
- **Worktree:** clean after the closeout commit. Reinspect with
  `git status --short --branch`; do not reset, rebase, or discard.
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
- The official native package is `@ladybugdb/core`; exact version selection and
  pinned-Bun/native packaging acceptance remain for LCLI-283.1.2/.1.4. The
  contract records the exact runtime version and rebuilds on change.
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
- Closeout: committed the complete LCLI-284 implementation and handover,
  pushed `dev` to `origin/dev`, fetched with remote-prune semantics, and deleted
  only the five merged local campaign branches identified in the repository
  state above.

## Remaining blockers

- **Code:** LCLI-283.1.2 through the remaining M6–M8 sequence are not yet
  complete. LCLI-284 has no remaining code or documentation blocker.
- **Upstream:** LCLI-253 requires a tagged Backlog.md release newer than the
  currently identified v1.48.0 and containing the stable JSON contract.
- **Operator:** LCLI-278 requires a decision for GitHub release-environment
  protection. The existing `release` environment has no effective required
  reviewer protection under the current plan.
- **External release gate:** the campaign closeout push of `dev` was authorized
  and completed. No tag, remote merge, GitHub settings change, npm publish, or
  public version selection was performed.

## Exact next action

In a separate focused session, re-run the mandated Backlog/Lore startup and
activate only `LCLI-283.1.2` to implement the deterministic LadybugDB
projection lifecycle. Do not start indexed routing (`LCLI-283.1.3`) until both
prerequisite lanes are Done, and do not advance the parent before all children
qualify.

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
docs/runbooks/lore-cli-release-campaign-handover.md. Preserve the published
campaign history and inspect the clean live repository/Backlog before changing
anything. Start only LCLI-283.1.2: verify its completed LCLI-283.1.1
dependency, activate and assign it, research the current projection contract
and official LadybugDB package, record the implementation plan in Backlog, then
implement and verify the deterministic projection lifecycle. Use pinned
/Users/jdnewhouse/.bun/bin/bun 1.2.23. Do not start indexed routing, explorer,
M8, or held MCP/Confluence/library scope in this focused session. Do not pull,
push, publish, tag, rewrite history, change GitHub settings, or advance a parent
before all children qualify.
```
