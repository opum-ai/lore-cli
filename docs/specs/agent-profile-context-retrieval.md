---
type: Spec
title: Agent profile context retrieval
tags:
  - agents
  - context
  - retrieval
  - cli
  - orchestration
summary: Defines the local profile schema, CLI surface, deterministic section retrieval, evidence pack, and orchestrator roster contracts.
timestamp: 2026-08-01T17:28:19.882Z
---

# Agent profile context retrieval

## Summary

Lore provides named, committed context profiles that constrain its existing
deterministic retrieval to the evidence relevant to a specialist or
orchestrator. Profiles are portable context policy only. Native Claude Code and
Codex agents continue to own behavior, tools, models, permissions, skills,
memory, sandboxing, and execution.

The public surface is a singular `lore agent` command family. It compiles one
bounded, source-attributed evidence pack from explicit profile references,
using mandatory pins followed by task-ranked Markdown sections. The existing
plural `lore agents` bridge command retains its current meaning.

## Requirements

- Git-tracked documentation and `.lore/` configuration remain source truth.
  The LadybugDB projection remains derived and the in-memory bundle remains the
  conformance oracle.
- A profile never silently broadens beyond its explicit concept or heading
  references. Graph-neighbor expansion is not implicit.
- Pinned evidence is mandatory and cannot disappear behind relevance ranking.
- Successful context output fits its effective budget and reports complete
  selection and omission accounting.
- Retrieval remains deterministic, lexical, local, and read-only with no
  embeddings, inferred relationships, model calls, network requests, or raw
  Cypher.
- Profiles do not enter the OKF concept graph or projection schema `1.0`.
- Missing profile configuration is backward compatible for every existing
  command.
- Repository documentation is evidence, not a mechanism for overriding system,
  developer, native-agent, sandbox, or permission instructions.
- A profile is a retrieval scope, not an authorization boundary. Filesystem and
  host permissions remain authoritative.

## Design

### Profile storage and schema

Lore discovers regular `.toml` files directly below `.lore/agents/`, in
code-unit filename order. A missing directory means no profiles. Symlinks,
directories masquerading as profile files, case-colliding names, and unknown
keys fail validation.

Specialist example:

```toml
schema_version = 1
name = "frontend-dev"
description = "Frontend implementation and UI review context."
kind = "specialist"
max_tokens = 8000

pinned = [
  "reference/ui-style#accessibility"
]

sources = [
  "specs/ui-design",
  "adr/0012-client-state"
]
```

Orchestrator addition:

```toml
kind = "orchestrator"
delegates = ["frontend-dev", "backend-dev", "qa-reviewer"]
```

Contract:

- `schema_version` is required and equals integer `1`.
- `name` is required lower-kebab, matches the filename stem, and is unique.
- `description` is required, single-line routing metadata of at most 300
  characters. It is not injected behavioral guidance.
- `kind` is required and is `specialist` or `orchestrator`.
- `max_tokens` is an optional positive safe integer and defaults to `8000`.
- `pinned` and `sources` are optional ordered arrays defaulting to empty. Each
  item is a canonical bundle-relative concept id with an optional
  GitHub-compatible `#heading-anchor`.
- References resolve against the active verified bundle. Anchors use the same
  duplicate-heading slug behavior as `lore check`.
- References are unique after normalization. A whole-document reference
  overlaps every section reference to the same concept and cannot appear in
  both tiers.
- A specialist declares at least one pinned or ranked reference and cannot
  declare `delegates`.
- An orchestrator declares at least one direct delegate and may declare its own
  evidence. Delegates may be specialists or orchestrators, but the complete
  directed graph has no missing node, self-edge, or cycle.

All profile files load and validate as one snapshot. `lore check` validates the
same syntax, references, and delegate graph before emitting a coherence report.
A profile command fails before output when its snapshot is invalid.

### CLI surface

| Command | Contract |
|---|---|
| `lore agent list` | List name, kind, description, effective default budget, source count, and direct-delegate count in deterministic name order. |
| `lore agent show <name>` | Show the resolved profile and normalized references without document bodies. |
| `lore agent context <name> --task "<text>"` | Compile the task-scoped context pack. |

`context` accepts:

- exactly one of `--task <text>` or
  `--task-file <repo-relative-path|->`; task files cannot escape the repository
  or traverse a symlink;
- `--max-tokens <n>` to override the profile default;
- `--out <repo-relative-path>` to atomically write the same canonical Markdown
  bytes emitted by the plain renderer; and
- `--force` only with `--out`, to replace a differing regular file.

Global `--plain` and `--json` retain their current precedence and stream
contract. Pretty and plain render the same pasteable Markdown evidence pack.
JSON uses Lore's standard envelope with these kinds:

- `agent.profiles`;
- `agent.profile`; and
- `agent.context.export`.

An unknown profile is `not_found` exit `3`. Invalid arguments are usage exit
`2`; output permission failures are `4`; a differing output collision is `5`;
and malformed profiles, references, cycles, or impossible pinned budgets are
validation exit `6`. The command decides validation, retrieval, and write
outcomes before stdout.

`--out` resolves against the repository root and may not escape it. The writer
applies the existing whole-target symlink sweep, creates parent directories
safely, and uses the existing atomic temp-write plus rename boundary. Identical
bytes are unchanged. `.lore/cache/contexts/` is the recommended ignored
location, but no context file is written by default.

### Context export

The structured `AgentContextExport` contains:

- `profile`: name, description, kind, and effective default;
- exact `task`, effective `maxTokens`, final `tokenEstimate`, and `packDigest`;
- `pinned`: every mandatory selected item;
- `sections`: ranked selected items in emission order;
- `catalog`: every allowed source with resolved id/path/title, candidate and
  selected counts, top score, token estimates, and included/omitted reason;
- optional `delegates`: direct name, kind, and description entries;
- `total`, `shown`, and `truncated` over ranked candidates; and
- optional `write`: repo-relative path plus `created`, `updated`, or
  `unchanged`.

Each selected item carries its normalized reference, concept id, optional
anchor and heading breadcrumb, repo-relative source path, exact body bytes,
chars-per-four token estimate, SHA-256 content digest, and optional BM25 score.
The pack digest is SHA-256 over the final canonical Markdown bytes. No
timestamp, Git cleanliness, absolute path, Ladybug identifier, or database
detail enters the pack.

### Deterministic compilation

1. Resolve the profile and all referenced concepts from the same verified
   retrieval snapshot used by `graph`, `query`, and `context`.
2. Render and reserve fixed overhead: task/profile header, evidence warning,
   complete compact source catalog, budget/truncation footer, and an
   orchestrator's direct-delegate roster.
3. Resolve pins in authored order. A whole-document pin includes the full body;
   an anchored pin includes that complete heading-bounded section. Pins are
   never truncated. If fixed overhead plus pins exceeds the effective budget,
   validation fails with a remedy to raise the budget, narrow a pin, split the
   source, or move it to ranked context.
4. Build candidates from `sources`. A source explicitly narrowed to a heading
   produces candidates only within that section. Lore never follows an
   unlisted graph neighbor.
5. Keep a source whole when its emitted estimate is no greater than
   `min(2000, floor(maxTokens / 4))`. Otherwise parse its body with the existing
   Markdown AST and partition it into non-overlapping heading-bounded sections.
   Carry ancestor headings as a breadcrumb. Split an oversized section only at
   top-level AST block boundaries; never cut a code block, list, or table. One
   indivisible oversized block remains one candidate and may be omitted.
6. Reuse the exact arbitrary-record BM25 scorer behind `lore query`. Rank only
   this profile's candidates using concept id, title, summary, tags, heading
   breadcrumb, and body as searchable text.
7. Sort score descending, then declared source order, document section order,
   and normalized reference. If tokenization yields no task term or every
   candidate scores zero, fall back to declaration and section order.
8. Fill the residual budget with deterministic first-fit. Scan ordered
   candidates, include one when the complete rerendered pack fits, otherwise
   mark it omitted and continue to smaller candidates.
9. Render canonical Markdown, compute the chars-per-four estimate, and hash the
   exact bytes. Every successful pack is at or below `maxTokens`; `truncated` is
   true whenever any ranked candidate was omitted.

Repeated compilation over byte-identical profile, task, budget, bundle, and
retrieval inputs is byte-identical across indexed and reference paths. An agent
may rerun with a narrower task or larger budget, or use `lore context <id>
--depth 0` to inspect a named omitted source.

### Orchestrator contract

An orchestrator pack contains only its own pins and ranked evidence plus a
compact roster of direct delegates in declared order. The roster gives a native
orchestrator enough routing metadata to choose a worker; it does not inline
delegate source lists or bodies. Each native worker invokes `lore agent
context` independently for its assigned profile.

Host-specific nesting limits, tools, execution, permissions, and synthesis
remain outside Lore.

### Claude Code and Codex adapters

Lore's generated Claude and Codex skill guidance documents this one-line
convention:

> Lore profile: `<name>`. Before working, run `lore agent context <name> --task
> "<assigned task>"` and ground decisions in the returned source IDs.

Users place the line in a Claude agent's Markdown body or a Codex agent's
`developer_instructions`. Lore does not scan, create, rewrite, or validate
`.claude/agents/*.md` or `.codex/agents/*.toml`.

### Compatibility and deferred extensions

- The singular `agent` family is additive. The plural `agents` bridge command,
  existing command output, OKF profile type system, and projection schema remain
  unchanged.
- Local v1 covers one repository and one bundle. Workspace-qualified
  references wait for the accepted multi-repository workspace contract.
- Hosted synchronization, graph persistence, authorization, MCP tools, and web
  visibility require separate cross-repository contracts and are not implied.
- Profile loading and context compilation remain pure core modules behind thin
  command/file-output layers so a future transport can reuse them without
  becoming a local prerequisite.

## Open questions

None block local v1. Later proposals must independently decide:

- workspace-qualified profile references and conflict behavior;
- whether profiles participate in hosted synchronization and authorization;
- whether a structured `lore_agent_context` MCP tool is warranted; and
- whether measured corpora justify a different deterministic section threshold
  or tokenizer without changing the no-vector boundary.
