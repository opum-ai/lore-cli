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
whole concept and one of its headings in the same profile. `max_tokens` is a
ceiling on the compiled pack, and choosing it is its own measurement — see
[Choosing a `max_tokens` budget](#choosing-a-max_tokens-budget).

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

## Choosing a `max_tokens` budget

`max_tokens` is a ceiling, not a hint: the compiler walks the ranked section
candidates and keeps each one that still fits, so the budget decides which
evidence survives a task, not only how long the pack is. Too small a budget
drops sources the task is genuinely about; a fixed number copied from another
bundle does not transfer, because the ranking depends on this bundle's content.
Measure this bundle, and re-measure when a declared source changes
substantially.

**Sweep it.** Take three or four tasks the profile exists for and compile each
at a range of budgets, varying only the budget:

```sh
for budget in 12000 16000 20000 24000; do
  lore agent context frontend-dev --task "$TASK" --max-tokens "$budget" --json |
    jq -r --arg b "$budget" '.data.catalog[]
      | select(.reason == "omitted-by-budget")
      | "\($b)\t\(.reference)\t\(.topScore)"'
done
```

The pack's `Allowed source catalog` section carries the same information in
prose: one line per declared source with its selected count and its top
relevance score. `omitted-by-budget` means the source was dropped whole, and
`partially-included` means the pack holds some of its blocks.

**Read the result as a table, not as a curve that converges.** Omission is not
monotone in the budget, so a larger budget can yield a strictly worse pack.
Sections are ranked and admitted whole, so raising the ceiling can finally admit
one large high-scoring section that then consumes the room a dozen smaller ones
were using. Measured on this bundle (2026-09-29), on one task: 19500 selected
20 sections and fully omitted 6 sources, 20000 selected 23 and omitted 5, and
20500 selected just 5 and omitted 8 — a single 13448-token section fit once the
budget reached 20500. The budget is enforced as a ceiling, so this is correct
behaviour rather than a defect, but it makes the chosen number a measured local
optimum rather than a plateau — and it means "raise the budget until nothing
more is dropped" is not the rule, because the larger budget that stops dropping
one section can start dropping several. [LCLI-640](../../.quest/completed/LCLI-640.json)
measured the same non-monotonicity across a wider sweep.

**Apply the omission test.** The working test the fleet's profiles were sized
against: no source whose top score is 9 or above may be fully omitted. A source
scoring that highly is one the ranking says the task is substantially about, so
a pack that drops it entirely has lost its most relevant evidence. Treat 9 as a
working default rather than a property of the format — read the score column of
your own sweep and check that the line you draw separates the sources your tasks
actually need. Prefer the budget with the fewest omissions and the lowest
worst-omitted score under that test, judged across every task you swept rather
than one pack, because a source omitted for one task is routinely selected for
another.

**Do not confuse this with the capacity floor.** `lore check` reports
`agent-profile-capacity` for a profile whose *complete declared set* cannot fit
its budget at all — computed from the declaration and the bundle, never from a
task: the measurement renders score annotations at full width and reserves the
worst-case bundle-wide query section, so it stands for the largest pack any task
can compile (LCLI-662, DEC-98 B; the definition and its residuals are
[ADR-0025](../adr/0025-the-capacity-measurement-reserves-the-worst-case-bundle-wide-query-section-and-renders-score-annotations-at-full-width-dec-98.md)).
It
ships as a warning for one release, then as an error (LCLI-646). That is a floor
rather than an answer to which budget is well chosen: a capacity finding means
the profile can never hold the evidence it declares and names the size to raise
the budget to, while a per-task omission under a tight budget is the normal,
budget-driven case. This repository's own `.lore/agents/*.toml` profiles were
sized by the sweep above and re-budgeted up rather than narrowed, so they are a
worked example of the method; their numbers are measurements of this bundle,
not defaults to copy.

## Rollback

Remove or revert the affected `.lore/agents/<name>.toml` file, then rerun
`lore check --strict`. Delete any saved `.lore/cache/contexts/` packs; they are
derived and can be regenerated. No native agent configuration changes are
required unless the optional one-line adapter instruction was added manually.

If compilation fails because a mandatory pin no longer fits, raise the budget,
narrow the pinned evidence, or split the source document at a meaningful
heading. Do not weaken a mandatory pin into best-effort evidence merely to make
the command succeed.
