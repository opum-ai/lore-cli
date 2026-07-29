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
  Open (or paste) this at the start of a new dev session to begin implementing
  lore with the right constraints, entry points, and workflow.
timestamp: 2026-06-21T00:00:00Z
---

# Developer kickoff — start building lore

This runbook doubles as a **handover prompt**: open it at the start of a fresh session (or
paste its body as the first message) to begin implementing **lore** — a thin, OKF-native
documentation CLI (Bun + TypeScript) that couples repo-resident docs to Backlog.md and serves
them to agents and humans. The repo, documentation, and a 44-task build plan already exist.
No application source code exists yet; your job is to start implementing it.

## Orientation (read first, in order)

1. [`lore-spec.md`](../../lore-spec.md) — the product spec (v0.2).
2. [`docs/index.md`](../index.md) — the OKF bundle entry point; follow it into:
   - [architecture](../reference/architecture.md), [tech-stack](../reference/tech-stack.md), [cli-surface](../reference/cli-surface.md), [cli-contract](../reference/cli-contract.md)
   - [backlog-json-schema](../reference/backlog-json-schema.md) + [backlog-cli-contract](../reference/backlog-cli-contract.md) — the verified Backlog.md integration contract
   - [consumer-compatibility](../reference/consumer-compatibility.md), [portable-markdown](../reference/portable-markdown.md), [okf-conformance](../reference/okf-conformance.md)
   - [lore-design](../specs/lore-design.md) — implementation design (modules, sequence flows, testing)
   - [the ADR log](../adr/index.md) — 16 ADRs; the load-bearing ones are 0002, 0004, 0005, 0006, 0007, 0010, 0012, 0014, 0015
   - [backlog-json-patch](backlog-json-patch.md) and [agent-onboarding](agent-onboarding.md)
3. `backlog overview` and `backlog instructions overview` — the build plan and task workflow.

## Repo facts

- Path: `/Volumes/external/repos/lore` (private GitHub repo `jeremy-newhouse/lore`).
- Branches: `main` (release) + `dev` (default/working). **Branch from and PR into `dev`.**
- Backlog integration targets upstream PR #790's JSON contract. The Docker E2E
  image compiles `MrLesk/Backlog.md` at its merge commit until a containing tag
  exists; lore has no Backlog package/git dependency.
- Bun is pinned to the version in `.bun-version`; verify with `bun --version`
  before running the gates (see [ADR-0001](../adr/0001-runtime-build-distribution.md)).

## Non-negotiable constraints (easy to get wrong — honor these)

1. **CLI is the primary interface; the MCP server is deferred to v2 (milestone M6). Do NOT build MCP now.**
2. **Backlog integration is JSON-only.** Do **not** add a `--plain` parser.
   PR #790 is merged upstream; until its release tag exists, validate against
   the pinned upstream merge commit described in
   [backlog-json-patch](backlog-json-patch.md).
3. **All Backlog writes go through the `backlog` CLI** (`task create`/`edit`). Never hand-edit `backlog/**` task or milestone files. lore is the **sole git committer** of `backlog/` (Backlog `auto_commit` stays false).
4. **OKF cross-links** are relative, URL-encoded, `.md`-suffixed, no leading slash, no wikilinks ([ADR-0010](../adr/0010-multi-consumer-docs-layer.md)). Sub-index files carry no frontmatter; `okf_version` lives only on the root [index](../index.md).
5. **Core is deterministic: no LLM calls, no vector DB/RAG/chunking, no Rust binaries (e.g. lychee) as runtime deps** ([ADR-0014](../adr/0014-core-has-no-llm-dependency.md), [0015](../adr/0015-lightweight-retrieval-no-vectors.md), [0007](../adr/0007-validation-and-coherence.md)). Link checking is pure-JS (remark).
6. **Every command** supports `--plain` and `--json` (envelope `{schemaVersion, kind, data}`), uses the semantic exit codes (0/2/3/4/5/6) and `--json` error envelope, writes data to stdout / diagnostics to stderr, and is idempotent. All logic lives in a reusable `core/` library; commands are thin ([ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md), [0005](../adr/0005-cli-contract.md)).

## How to work

1. Run `backlog task list --status "To Do" --json` and pick the next
   release-relevant, unblocked task; v2 MCP/Confluence/library items remain
   deliberately deferred.
2. Claim it: `backlog task edit LCLI-N -s "In Progress"`. Read its acceptance criteria and linked docs via `backlog task view LCLI-N --plain`.
3. Implement against the ADRs/spec. Prefer TDD (Bun test). Keep `core/` a library returning structured objects; commands thin.
4. Validate before committing: `bun test`, `bun run lint`, `bun run typecheck` (set these up in M0). Once `lore check` exists, it is the bundle CI gate.
5. Commit to `dev` with Conventional Commits, ending messages with:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
6. Finish the task: `backlog task edit LCLI-N -s Done` with a `--final-summary`, and update [`CHANGELOG.md`](../../CHANGELOG.md) (Unreleased).

## First move

Confirm your understanding by summarizing the build order (BJP → M2; M0 → M1 → M2; M3 → M5;
M6–M8 deferred) and the JSON-only / CLI-first constraints, then propose starting **M0
(`LCLI-6`: scaffold package.json / tsconfig / pinned Bun)** in parallel with **BJP (`LCLI-1`:
fork + `--json` task)**. Then begin.
