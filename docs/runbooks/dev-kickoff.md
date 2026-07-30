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
  Open this in a fresh session to execute the M6 schema, Commander, and
  LadybugDB lanes in dependency order without pulling the explorer forward.
timestamp: 2026-06-21T00:00:00Z
---

# Developer kickoff — start building lore

This is the component handover for a fresh M6 implementation session in
`lore-cli`. The CLI, deterministic in-memory graph/query/context surfaces, test
suite, compiled distribution, and deterministic export already exist. The next
work is not a greenfield build: it adds a persistent derived projection while
preserving those contracts.

## Orientation

Read these in order before changing task state or source:

1. Repository `AGENTS.md`, then `backlog instructions overview`.
2. [Documentation index](../index.md) and the
   [local graph platform roadmap](../specs/local-graph-platform-roadmap.md).
3. [ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md),
   [architecture](../reference/architecture.md), and
   [tech stack](../reference/tech-stack.md).
4. [CLI surface](../reference/cli-surface.md) and
   [CLI contract](../reference/cli-contract.md); these are compatibility inputs
   for Commander and indexed routing.
5. `backlog task view LCLI-283.1.1 --plain`, followed only by the task selected
   according to the dependency graph below.

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

1. `LCLI-283.1.1` freezes the LadybugDB schema and lifecycle contract.
2. After it is accepted, two independent branches may proceed:
   - `LCLI-284` migrates CLI parsing, dispatch, and help to Commander.
   - `LCLI-283.1.2` implements the deterministic projection lifecycle.
3. `LCLI-283.1.3` depends on both branches and integrates indexed
   `graph`, `query`, and `context`.
4. `LCLI-283.1.4` completes performance, packaging, recovery, concurrency, and
   scale gates.
5. `LCLI-283.2.1` may define the explorer contract after step 1, but
   `LCLI-283.2.2` implementation waits for all M6 gates.

This ordering prevents new indexed options from being implemented in the
hand-rolled parser and then migrated again. It does not build the explorer
against an unstable projection.

## Non-negotiable constraints

1. **Start with `LCLI-283.1.1`; do not activate a high-level parent as a
   substitute for its atomic task.**
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

## Fresh-session procedure

1. Inspect, do not clean blindly:

   ```text
   git status --short --branch
   git log -5 --oneline
   ```

2. Run `backlog instructions overview` and
   `backlog instructions task-execution`.
3. View `LCLI-283.1.1`, confirm it is unblocked, then mark only that task
   `In Progress` and assign the current worker.
4. Research the deterministic export, in-memory graph, current packaging
   matrix, and LadybugDB Node/Bun support before recording the task plan.
5. Put the researched plan in Backlog before implementation. The task must
   freeze stable identities, provenance, storage, freshness, rebuild,
   corruption, atomic replacement, and single-writer semantics; do not install
   or wire LadybugDB yet unless that activated task's accepted scope requires a
   verified spike.
6. Implement on a focused feature branch and finish the task through the
   Backlog finalization workflow. Only then activate `LCLI-284` and/or
   `LCLI-283.1.2`.

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
LadybugDB work must add deterministic conformance, native packaging,
concurrency, corruption/rebuild, and benchmark evidence as its tasks require.

## Stop conditions

Stop and resolve the dependency or contract instead of guessing if:

- `LCLI-283.1.1` is not accepted but a later task needs a schema or lifecycle
  decision;
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
from the current local dev baseline without discarding its commits. Start only
LCLI-283.1.1: research and freeze the LadybugDB projection schema and lifecycle
contract, record the plan in Backlog, and implement only that accepted task.
Do not start Commander (LCLI-284), projection implementation
(LCLI-283.1.2), indexed routing, the graph explorer, M8, or local MCP until the
documented dependencies permit them.
```
