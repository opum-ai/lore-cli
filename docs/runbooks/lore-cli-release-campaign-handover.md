---
type: Runbook
title: Lore CLI release campaign handover
tags:
  - handover
  - campaign
  - release
  - ladybugdb
summary: Durable atomic-task cursor, verification record, blockers, and next-session handoff for the full-featured Lore CLI release campaign.
timestamp: 2026-07-30T18:48:44.851Z
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
- **Current atomic cursor:** `LCLI-284` — migrate CLI argument parsing and
  routing to Commander.
- **Cursor status:** To Do and not activated in this session.
- **Dependency state:** eligible. Its sole dependency, `LCLI-283.1.1`, is
  Done. Parent `LCLI-283.1` remains To Do and must not be finalized before all
  four children qualify.
- **Last completed atomic task:** `LCLI-283.1.1`.
  - activation/plan commit: `1931ce6`;
  - Backlog acceptance/finalization commit: `a46a802`;
  - contract implementation commit: `15a3a29`.
- **Closed prior campaign:** the dependency-boundary campaign remains closed
  and must not be reactivated.

## Repository state

- **Branch after this checkpoint is integrated:** `dev`. LCLI-283.1.1 was
  developed on `feature/lcli-283-1-1-ladybug-contract` and fast-forwarded
  locally; the feature branch is retained.
- **Campaign starting HEAD:** `484353d8d8a973aa24d6e429525c489fe44daca3`.
- **Completed-task implementation HEAD:**
  `15a3a29a661d904942e02fa19946a80685f6bd90`. The handover checkpoint commit
  immediately follows it; inspect `git rev-parse HEAD` for that
  self-referential commit's hash.
- **origin/dev:** `1afd3bba89dd0f43a7a6a13cab90fe916e018c58`.
- **Starting divergence:** local `dev` was 26 commits ahead and 0 behind.
- **Checkpoint divergence:** local `dev` is expected to be 30 commits ahead and
  0 behind after the handover commit and local fast-forward.
- **Worktree:** clean after the handover commit and local fast-forward.
  Reinspect with `git status --short --branch`; do not reset, rebase, or
  discard.
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

The detailed frozen contract is in
[ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md)
and its sequence-level summary is in the
[local graph platform roadmap](../specs/local-graph-platform-roadmap.md).

## Verification record

Startup and research completed on 2026-07-30:

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
- Official Ladybug documentation/repository and npm metadata: verified
  `@ladybugdb/core`, native platform packages, typed schema, on-disk
  persistence, and one-writer-or-many-readers concurrency. Registry `latest`
  was `0.19.0`; no package was installed or wired by this contract task.
- Focused:
  `/Users/jdnewhouse/.bun/bin/bun test test/local-graph-contract.test.ts` —
  4 passed, 0 failed, 36 assertions.
- Full:
  `/Users/jdnewhouse/.bun/bin/bun test` — 2,249 passed, 0 failed, 6,489
  assertions across 52 files.
- `/Users/jdnewhouse/.bun/bin/bun run lint` — 119 files clean.
- `/Users/jdnewhouse/.bun/bin/bun run typecheck` — clean.
- `/Users/jdnewhouse/.bun/bin/bun run build` — 222 modules compiled;
  `./dist/lore --version` — `0.0.0`.
- `lore sync` — Backlog final state committed and generated bundle files
  reconciled.
- `lore validate --strict` and `lore check --strict` — 46 concepts, 0 errors,
  0 warnings.
- `git diff --check` — clean.

## Remaining blockers

- **Code:** LCLI-284 and the remaining M6–M8 task sequence are not yet
  complete. LCLI-283.1.1 has no remaining code or documentation blocker.
- **Upstream:** LCLI-253 requires a tagged Backlog.md release newer than the
  currently identified v1.48.0 and containing the stable JSON contract.
- **Operator:** LCLI-278 requires a decision for GitHub release-environment
  protection. The existing `release` environment has no effective required
  reviewer protection under the current plan.
- **External release gate:** no pull, push, tag, remote merge, GitHub settings
  change, npm publish, or public version selection is authorized.

## Exact next action

Open a fresh focused session on local `dev` at `LCLI-284`. Re-run the mandated
Backlog/Lore startup, verify the live task and `LCLI-283.1.1` dependency, then
activate only LCLI-284, research the current parser/command tests and current
official Commander package contract, record a concrete plan in Backlog, and
perform the compatibility-preserving parser migration. Do not activate
LCLI-283.1.2 or any later graph/explorer task in the same focused session.

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
docs/runbooks/lore-cli-release-campaign-handover.md. Preserve the unpublished
local dev history and inspect the live repository/Backlog before changing
anything. Start only LCLI-284: verify its completed LCLI-283.1.1 dependency,
activate and assign it, research the current CLI parser and official Commander
package, record the implementation plan in Backlog, then implement and verify
the compatibility-preserving migration. Use pinned
/Users/jdnewhouse/.bun/bin/bun 1.2.23. Do not start LCLI-283.1.2, indexed
routing, explorer, M8, or held MCP/Confluence/library scope in this focused
session. Do not pull, push, publish, tag, rewrite history, change GitHub
settings, or advance a parent before all children qualify.
```
