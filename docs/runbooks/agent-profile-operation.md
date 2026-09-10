---
type: Runbook
title: Agent profile implementation and operation
summary: How to define, validate, and use task-scoped agent profiles with Claude Code and Codex.
timestamp: 2026-08-01T17:28:20.108Z
---

# Agent profile implementation and operation

## Purpose

Use a committed Lore profile to compile a deterministic, bounded evidence pack
for one native Claude Code or Codex agent. Profiles choose documentation; the
native agent file continues to own behavior, tools, permissions, models, and
execution.

## Prerequisites

- Run commands from a Lore repository with a valid `docs/` bundle.
- Keep profiles in `.lore/agents/`. A missing directory is valid and means no
  profiles are configured.
- Use a lower-kebab profile name and the same filename, for example
  `.lore/agents/frontend-dev.toml` for `name = "frontend-dev"`.
- Reference existing Lore concept IDs or heading anchors. Use `lore find` or
  `lore show` to confirm an ID before adding it to a profile.

## Steps

### 1. Define the profile

Create a strict TOML file. A specialist selects its own evidence:

```toml
schema_version = 1
name = "frontend-dev"
description = "Implements the browser-facing application surface."
kind = "specialist"
max_tokens = 4000
pinned = ["specs/design-system#accessibility"]
sources = ["reference/architecture", "runbooks/frontend-testing"]
```

Pins are mandatory evidence. Sources are task-ranked candidates. Do not list a
whole concept and one of its headings in the same profile.

An orchestrator names direct delegates instead of selecting their evidence:

```toml
schema_version = 1
name = "delivery-lead"
description = "Routes implementation work to repository specialists."
kind = "orchestrator"
delegates = ["frontend-dev", "api-dev"]
```

Delegate references must exist, cannot point to the profile itself, and cannot
form a cycle. An orchestrator pack includes only its own evidence and a compact
delegate catalog; each worker compiles its own specialist pack.

### 2. Validate discovery and references

```sh
lore agent list
lore agent show frontend-dev
lore check --strict
```

Discovery and output order are bytewise deterministic. Lore rejects unknown
keys, filename/name mismatches, unsafe file types, missing concept or anchor
references, invalid specialist/orchestrator fields, and delegate cycles.

### 3. Compile task-scoped context

```sh
lore agent context frontend-dev --task "Add accessible dialog focus management"
```

Use exactly one task input. For long or generated task descriptions, use a
repo-relative, non-symlink file or standard input:

```sh
lore agent context frontend-dev --task-file task.txt
lore agent context frontend-dev --task-file -
```

Override the profile budget with `--max-tokens`. Lore reserves space for the
pack metadata and mandatory pins, ranks only the explicit source allowlist,
and adds complete Markdown blocks until the budget is full. It never calls a
model or the network.

### 4. Save an optional handoff artifact

```sh
lore agent context frontend-dev \
  --task "Add accessible dialog focus management" \
  --out .lore/cache/contexts/frontend-dialog.md
```

Output paths must stay inside the repository and cannot traverse symlinks.
Lore writes atomically, reports an unchanged existing file without rewriting
it, and requires `--force` before replacing different bytes. Saved packs are
reproducible cache artifacts, not canonical documentation.

### 5. Connect an existing native agent

Keep the adapter instruction deliberately small:

> Lore profile: `frontend-dev`. Before working, run `lore agent context
> frontend-dev --task "<assigned task>"` and ground decisions in the returned
> source IDs.

`lore agents sync` includes this convention in generated Claude Code and Codex
guidance. It does not generate native subagents or assign profiles
automatically.

## Rollback

Remove or revert the affected `.lore/agents/<name>.toml` file, then rerun
`lore check --strict`. Delete any saved `.lore/cache/contexts/` packs; they are
derived and can be regenerated. No native agent configuration changes are
required unless the optional one-line adapter instruction was added manually.

If compilation fails because a mandatory pin no longer fits, raise the budget,
narrow the pinned evidence, or split the source document at a meaningful
heading. Do not weaken a mandatory pin into best-effort evidence merely to make
the command succeed.
