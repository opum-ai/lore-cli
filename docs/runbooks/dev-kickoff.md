---
# yaml-language-server: $schema=../../.lore/schemas/runbook.schema.json
type: Runbook
title: Developer kickoff — start building lore
description: >-
  A self-contained handover for beginning lore implementation in a fresh
  session: orientation, the non-negotiable constraints, the entry points, and
  the working agreement.
tags: [lore, runbook, onboarding, handover, development]
summary: >-
  Fresh-session publication handover for landing-reviewed M6 indexed graph,
  query, and context routing before later packaging gates.
timestamp: 2026-07-31T00:20:13Z
---

# Developer kickoff — start building lore

This is the component handover for a fresh M6 indexed-routing publication session in
`lore-cli`. The CLI, deterministic in-memory graph/query/context surfaces,
Commander routing, compiled distribution, deterministic export, and
LadybugDB projection lifecycle and indexed read routing already exist and have
passed landing review. The next operation is protected publication when
separately authorized, not new implementation; the in-memory implementation
remains the oracle and fallback.

## Orientation

Read these in order before changing task state or source:

1. Repository `AGENTS.md`, then `backlog instructions overview`.
2. [Documentation index](../index.md) and the
   [local graph platform roadmap](../specs/local-graph-platform-roadmap.md).
3. [ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md),
   [architecture](../reference/architecture.md),
   [tech stack](../reference/tech-stack.md), and the
   [dependency boundary audit](../reference/dependency-boundary-audit.md).
4. [CLI surface](../reference/cli-surface.md) and
   [CLI contract](../reference/cli-contract.md); these are compatibility inputs
   for Commander and indexed routing.
5. The [release campaign handover](lore-cli-release-campaign-handover.md), then
   live Backlog records for `LCLI-283.1`, `LCLI-283.1.2`, `LCLI-283.1.3`,
   `LCLI-283.1.4`, and `LCLI-284`.

## Repository facts

- Path: `/Volumes/external/repos/lore-cli`.
- Remote: private `salient-data/lore-cli`.
- Integration branch: `dev`; stable/release branch: `main`.
- Branch feature work from the current local `dev` and target PRs back to
  `dev`. Never discard local commits merely because `dev` is ahead of
  `origin/dev`; inspect the central session handover first.
- npm package remains `@salient-data/lore`; executable remains `lore`.
- Bun is pinned by the repository. Check `bun --version` before installing or
  building native dependencies.
- Backlog integration remains JSON-only against the pinned upstream
  `--json`-capable commit until a containing release is adopted by
  `LCLI-253`.

## Approved delivery graph

The feature order remains M6 LadybugDB → M7 explorer → M8 indexed
capabilities. Only a preparation lane moves earlier:

1. `LCLI-283.1.1` froze the LadybugDB schema and lifecycle contract.
2. The two independent prerequisites are complete and merged:
   - `LCLI-284` migrated CLI parsing, dispatch, and help to Commander.
   - `LCLI-283.1.2` implemented and landing-reviewed the deterministic
     projection lifecycle using the then-current exact
     `@ladybugdb/core@0.18.2`.
3. `LCLI-283.1.3` completed indexed `graph`, `query`, and `context` integration
   against both prerequisites; its protected publication is the next operation.
4. `LCLI-283.1.5` selected exact `@ladybugdb/core@0.19.0` / storage `43` and
   must finish matching-host qualification before the final M6 evidence.
5. `LCLI-283.1.4` completes performance, packaging, recovery, concurrency, and
   scale gates.
6. `LCLI-283.2.1` may define the explorer contract after step 1, but
   `LCLI-283.2.2` implementation waits for all M6 gates.

This ordering prevents new indexed options from being implemented in the
hand-rolled parser and then migrated again. It does not build the explorer
against an unstable projection.

## Completed dependency-boundary campaign

The four independent maintenance tasks outside the M6–M8 dependency graph are
Done and integrated into the local `dev` baseline:

- `LCLI-286` exact-pinned `ipaddr.js` 2.4.0 for IP parsing/CIDR matching while
  retaining Lore’s outbound-request policy.
- `LCLI-287` exact-pinned `github-slugger` 2.0.0 for heading slug/duplicate
  state while retaining Lore’s mdast text extraction and link policy.
- `LCLI-285` exact-pinned `string-width` 8.2.2 for terminal display width while
  retaining Lore’s sanitizer, padding, and output contracts.
- `LCLI-288` moved generic config shape recognition to the existing
  exact-pinned Zod 4.4.3 while retaining operational/security policy and Lore
  errors.

The focused commits, pinned-Bun and packaging evidence, and closeout state are
recorded in the
[dependency campaign handover](dependency-boundary-campaign-handover.md).
The active cursor is `LCLI-283.1.3`; the closed dependency campaign does not
block or reorder indexed routing, packaging qualification, or the explorer. The
[dependency boundary audit](../reference/dependency-boundary-audit.md) still
retains the deferred `write-file-atomic` and maintained
YAML/mdast-frontmatter investigations without authorizing either migration.

## Non-negotiable constraints

1. **Publish only the landing-reviewed `LCLI-283.1.3` change; do not activate
   the high-level parent or `LCLI-283.1.4` in that session.**
2. **Commander is a transport refactor, not a CLI redesign.** Preserve global
   flag positions, `--flag=value`, repeatable options, literal `--`, help and
   version output, injected writers, stdout/stderr separation, JSON envelopes,
   output precedence, semantic exits, TTY behavior, and `NO_COLOR`. Commander
   must not terminate the process or bypass Lore's error/output seams.
3. **LadybugDB is disposable derived state.** Git-tracked OKF documents and
   Backlog records remain authoritative; no raw Cypher or database identifier
   enters the public CLI.
4. **The in-memory implementation remains the conformance oracle and fallback.**
   Indexed ordering, lexical ranking, filtering, depth, budgets, truncation,
   errors, Unicode, dangling/duplicate behavior, and provenance must match.
5. **No embeddings, vector index, model call, hidden user-global graph, hosted
   AuraDB coupling, or local MCP enters M6.**
6. **All Backlog mutations use the `backlog` CLI.** Never hand-edit task,
   document, decision, or milestone files.
7. **Do not start M7 explorer implementation or M8 capabilities early.** Local
   MCP, Confluence, and importable-library work remain on hold.
8. **Keep Ladybug native loading lazy.** Bun 1.2.23 segfaults while loading the
   Windows addon; unsupported and fallback paths must execute without importing
   it. Native Windows qualification belongs to `LCLI-283.1.4`.

## Fresh-session procedure

1. Inspect, do not clean blindly:

   ```text
   git status --short --branch
   git log -5 --oneline
   ```

2. Run `backlog instructions overview` and
   `backlog instructions task-execution`.
3. Confirm `LCLI-283.1.2`, `LCLI-283.1.3`, and `LCLI-284` are Done and parent
   `LCLI-283.1` plus sibling `LCLI-283.1.4` remain To Do.
4. Read the completed task and landing-review evidence, then verify the clean
   local tip, remote baseline, active ruleset, and absence of an overlapping PR.
5. When separately authorized, create a focused feature branch at that exact
   tip, push it, open the normal PR to `dev`, and wait for required checks.
6. Do not merge, activate `LCLI-283.1.4`, or advance the parent in the same
   session.

## Verification

Run checks proportional to the activated task, with these full repository gates
before merge:

```text
bun test
bun run lint
bun run typecheck
bun run build
lore sync
lore validate --strict
lore check --strict
git diff --check
```

Commander work must also exercise source execution, compiled binaries,
platform packaging, parser parity, injected-stream behavior, and error paths.
Indexed-routing work must add shared indexed-versus-reference fixtures, state
and fallback coverage, no-partial-output evidence, and proof that unsupported
paths do not load the Windows native addon. Packaging, benchmark, and wider
native-platform qualification remain for `LCLI-283.1.4`.

## Stop conditions

Stop and resolve the dependency or contract instead of guessing if:

- either `LCLI-283.1.2` or `LCLI-284` is no longer Done;
- Commander behavior differs from the published CLI contract;
- LadybugDB cannot satisfy supported Bun/Node packaging or deterministic
  fallback requirements;
- a change would expose Cypher, mutate repository source through the index, or
  introduce a hidden cross-repository database; or
- work crosses into the explorer implementation, M8, local MCP, or hosted graph
  services.

## Ready-to-paste prompt

```text
Continue Lore CLI M6 from
/Volumes/external/repos/lore-cli/docs/runbooks/dev-kickoff.md.
Read AGENTS.md and run backlog instructions overview before any action. Work
from clean dev at the live protected baseline without discarding history.
Confirm LCLI-283.1.2, LCLI-283.1.3, and LCLI-284 remain Done. Review the
completed landing evidence, preserve the reviewed local tip, then use the
normal protected branch/PR flow only when publication is separately
authorized. Do not start
LCLI-283.1.4, advance the parent, or enter
explorer, M7/M8, MCP, Confluence, hosted-graph, release, tag, or publication
scope.
Use the complete current-session instructions in
docs/runbooks/lore-cli-release-campaign-handover.md.
```
