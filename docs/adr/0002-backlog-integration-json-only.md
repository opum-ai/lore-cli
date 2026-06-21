---
type: ADR
title: "ADR-0002: Backlog.md integration: JSON-only via --json (fork → upstream)"
description: lore integrates with Backlog.md exclusively through its CLI, reading structured JSON via a --json flag and parsing a canonical envelope; stock Backlog v1.47.1 lacks --json, so we fork, add it, consume the fork as a compiled git dependency, and upstream a PR.
tags: [adr, backlog, integration, json, fork, cli-contract]
summary: lore couples to Backlog.md only through its CLI, reading a canonical JSON envelope via a --json flag we add to a fork of Backlog.md (and upstream), with a fail-loud capability probe and no text-parser fallback.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0002: Backlog.md integration — JSON-only via `--json` (fork → upstream)

## Status

Accepted — 2026-06-21.

Supersedes the relevant parts of the spec's §3 and §10.1–10.2, which assumed a
`--plain` text-parsing adapter and speculated that consuming Backlog.md's own
MCP server might avoid parsing. Both assumptions were verified false (see
[Context](#context)).

## Context

`lore`'s differentiating feature is coupling repo-resident docs to Backlog.md
tasks. That coupling is only as reliable as the channel through which `lore`
reads and writes task data. We need a channel that is:

- **Machine-parseable** without bespoke, brittle text scraping.
- **Stable** across Backlog.md releases (a contract, not an accident of layout).
- **Agent/CI-safe**: deterministic, non-interactive, scriptable.
- **Non-invasive**: it must not depend on Backlog.md internals nor hand-edit
  Backlog.md's task files, both of which Backlog.md explicitly warns against.

We constrained ourselves to **integrating only through the Backlog.md CLI** — never
importing its internals (it ships as a compiled Bun binary with no published,
stable public library API) and never writing `backlog/tasks/*.md` directly
(Backlog.md mutates field types and metadata through its own commands, and
silently drops unknown frontmatter keys on edit). That leaves the question of
*what format* we read off the CLI.

We verified the following against **Backlog.md v1.47.1** (the current stock
release):

1. **Backlog.md emits no JSON.** There is no `--json` flag on any subcommand;
   `task list`, `task view`, and `search` produce only human-formatted text
   (and a `--plain` ANSI-free variant of that same text). Parsing it means
   reverse-engineering a presentation layer that can change between releases.
2. **The MCP server returns the same text.** Backlog.md's bundled MCP server
   does not return structured objects for these reads — it returns the same
   rendered text the CLI prints. This **corrects spec §10.2**: switching from
   "CLI text parsing" to "MCP-to-MCP" would save us *zero* parsing work, because
   the MCP layer hands back the very strings we'd otherwise scrape. MCP is not a
   structured-data shortcut here.
3. **Adding `--json` is cheap and low-risk.** Backlog.md already builds an
   in-memory model of each task before rendering it. A `--json` flag is a
   *serialize-before-format* branch: emit the existing model as JSON and skip the
   text formatter. It touches the presentation edge only — no schema migration,
   no storage change, no behavioral change to existing output.

Given (1)–(3), a `--plain` text parser would be the single most fragile
component in `lore`, coupling our correctness to Backlog.md's display
formatting forever. The structured data we want already exists one function call
upstream of the text we'd be parsing.

## Decision

**Integrate with Backlog.md exclusively through its CLI, reading structured JSON
via a `--json` flag, and `JSON.parse`-ing a canonical, versioned envelope. There
is no `--plain` text-parser fallback — that omission is deliberate.**

Concretely:

1. **Add `--json` to Backlog.md by forking it.** Stock v1.47.1 has no `--json`,
   so we fork `MrLesk/Backlog.md` → `jeremy-newhouse/Backlog.md` and add a
   minimal `--json` flag to exactly the three read commands `lore` needs:
   - `backlog task list --json`
   - `backlog task view <id> --json`
   - `backlog search <query> --json`

   The flag serializes Backlog.md's existing in-memory task model immediately
   before its text formatter would run. No new fields, no storage changes.

2. **Emit a canonical `{schemaVersion, kind, data}` envelope.** Every `--json`
   command prints a single JSON object of this shape to stdout:

   ```json
   {
     "schemaVersion": "1",
     "kind": "task.list",
     "data": [ /* tasks */ ]
   }
   ```

   `kind` distinguishes `task.list` / `task.view` / `search`; `schemaVersion` is
   an additive-only contract; `data` carries the payload. `lore` `JSON.parse`s
   exactly this envelope. The full field-level shape is specified in
   [Backlog.md JSON schema](../reference/backlog-json-schema.md), and the
   command/flag/exit-code contract in
   [Backlog.md CLI contract](../reference/backlog-cli-contract.md).

3. **Consume the fork as a locally-compiled git dependency.** `lore` depends on
   `jeremy-newhouse/Backlog.md` (pinned), compiled locally during install, so
   the `--json`-capable `backlog` binary is available before stock Backlog.md
   gains the flag. See
   [the Backlog.md JSON patch runbook](../runbooks/backlog-json-patch.md) for
   the rebase-onto-upstream and recompile procedure.

4. **Upstream a minimal PR.** We submit the `--json` additions to
   `MrLesk/Backlog.md` so the fork can eventually retire. The PR is deliberately
   minimal (three read commands, one flag, one envelope) to maximize merge
   odds. This is milestone **BJP** (Backlog `--json`), the first item in the
   build order — everything downstream depends on it.

5. **Fail loud via a capability probe.** At startup `lore` probes the `backlog`
   binary for `--json` capability and enforces a minimum `--json`-capable
   version. If `backlog` is missing, too old, or does not understand `--json`,
   `lore` exits with a clear, actionable error (validation/drift exit code `6`)
   pointing at the patch runbook. It never silently degrades, and there is no
   text-parsing fallback to degrade *to*. The probe result is cached in
   `.lore/cache/` (transient, gitignored).

6. **All writes go through `backlog task create` / `backlog task edit`.** `lore`
   never writes `backlog/tasks/*.md` directly. On create, it captures the new ID
   from the `Created task <ID>` line on stdout (it does **not** use `task view`'s
   exit code to test existence — `task view` exits `0` even for a missing task).

7. **Never store lore metadata on tasks.** Backlog.md drops unknown frontmatter
   keys on `edit`, so the doc → task back-reference lives as a *queryable label*
   `doc:<conceptId>` (set via `task edit --label`, surfaced for display with
   `--doc`), not as a custom frontmatter field.

8. **`lore` is the sole committer of `backlog/`.** Backlog.md is configured with
   `auto_commit=false`, `check_active_branches=false`, and
   `remote_operations=false`; `lore` performs the `git add`/`git commit` of task
   files itself, and `backlog/.locks/` is gitignored. (See
   [ADR-0004 on Backlog config and commit ownership](0012-backlog-coexistence-git-ownership.md).)

The boundary lives in a single isolated adapter (`src/adapters/backlog.ts`):
shell out via Bun's subprocess API, append `--json`, `JSON.parse` the envelope,
validate `schemaVersion`/`kind`, return typed objects. No Backlog.md code is
imported into `lore`'s runtime.

## Consequences

### Positive

- **Robust, contract-based reads.** `lore` parses a declared JSON envelope, not
  a presentation layer. Backlog.md can restyle its human output freely without
  breaking `lore`.
- **No fragile parser to maintain.** Eliminating the `--plain` text path removes
  the most failure-prone component `lore` would otherwise own; correctness is no
  longer coupled to display formatting.
- **Cheap, mergeable upstream change.** Serialize-before-format is a small,
  reviewable diff confined to the CLI edge — a realistic upstream PR, after
  which the fork can be dropped.
- **Clean failure modes.** The capability probe converts "subtly mis-parsed
  data" into "loud, actionable startup error," which is exactly what an agent/CI
  consumer needs (non-zero exit, clear hint).
- **Correct, durable coupling primitives.** Capturing the ID from
  `Created task <ID>`, using labels instead of dropped frontmatter, and writing
  only via `create`/`edit` keep `lore` aligned with Backlog.md's own rules.

### Negative / tradeoffs

- **A fork must exist until upstream merges.** `lore` carries a build/install
  dependency on a forked, locally-compiled `backlog` binary, with the
  maintenance cost of rebasing the fork onto upstream releases until (and if) the
  PR lands. Mitigated by keeping the patch minimal and documenting the procedure
  in the [patch runbook](../runbooks/backlog-json-patch.md).
- **Hard version floor.** Users cannot point `lore` at an arbitrary
  pre-installed stock `backlog`; they need the `--json`-capable build. The
  capability probe makes this explicit rather than mysterious, but it is a real
  install constraint.
- **No graceful degradation.** With no `--plain` fallback, an incompatible
  `backlog` means `lore`'s Backlog features are simply unavailable until the
  binary is upgraded. This is intentional (fail-loud over silently wrong) but is
  strictly less forgiving than a best-effort text parser.
- **Two moving parts to track.** We track upstream Backlog.md *and* our fork.
  Each new Backlog.md release is a potential rebase event for the BJP milestone.

## Alternatives considered

1. **Parse `--plain` text output (the original spec §3 approach).** Rejected:
   couples `lore`'s correctness to Backlog.md's display formatting, which has no
   stability guarantee; demands a bespoke parser per command and per future
   layout change; and silently mis-parses on drift unless heavily defended.
   It is the single most fragile design available, and the structured data we
   want already exists upstream of the text.

2. **Consume Backlog.md's bundled MCP server instead of the CLI.** Rejected:
   verified that the MCP server returns the *same rendered text*, not structured
   objects, so it saves no parsing work — it merely moves the scraping behind a
   transport. This directly corrects the spec §10.2 hypothesis. (CLI-first also
   aligns with [ADR-0009 on CLI-primary, MCP-deferred](0004-cli-first-skill-bridge-mcp-deferred.md).)

3. **Import Backlog.md as a library.** Rejected: Backlog.md ships as a compiled
   Bun binary with no published, stable public library API; depending on its
   internals would be brittle and would violate our "integrate only through the
   CLI" constraint.

4. **Read/write `backlog/tasks/*.md` directly.** Rejected: Backlog.md owns those
   files, normalizes field types and metadata through its own commands, manages
   `backlog/.locks/`, and explicitly warns against hand-editing. Direct file
   access would desynchronize Backlog.md's model and corrupt task state.

5. **Use stock Backlog.md v1.47.1 as-is and wait for upstream to add `--json`.**
   Rejected: there is no `--json` today and no committed timeline; blocking the
   entire `lore` Backlog coupling on an external roadmap is unacceptable. Forking
   to ship now, while upstreaming the same patch, gets the contract immediately
   and still drives toward eventual convergence.

## Related

- [Backlog.md CLI contract](../reference/backlog-cli-contract.md) — exact
  commands, flags, exit codes, and `Created task <ID>` capture.
- [Backlog.md JSON schema](../reference/backlog-json-schema.md) — the
  `{schemaVersion, kind, data}` envelope and per-`kind` payload shapes.
- [Backlog.md `--json` patch runbook](../runbooks/backlog-json-patch.md) — fork,
  patch, compile, rebase, and upstream procedure.
- [ADR-0004: Backlog.md config and commit ownership](0012-backlog-coexistence-git-ownership.md).
- [ADR-0009: CLI primary, MCP server deferred](0004-cli-first-skill-bridge-mcp-deferred.md).
- [lore design spec](../specs/lore-design.md).
