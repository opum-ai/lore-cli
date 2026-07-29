---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: "ADR-0013: .lore/ state directory"
description: >-
  Records where lore keeps its own state: a committed `.lore/config.toml`
  (parsed with Bun's native TOML, no dependency) carrying reconcile rules,
  link/validate options, and Confluence config; a committed
  `.lore/sync-state.json` for Confluence publish bookkeeping; and a gitignored
  `.lore/cache/` for transient data. Secrets (the Confluence token) are never
  stored — environment-only via LORE_CONFLUENCE_TOKEN.
tags: [adr, state, config, toml, cache, confluence, sync-state, secrets]
summary: >-
  lore keeps committed configuration and publish state in `.lore/`, transient
  data in an ignored cache, and secrets only in the environment.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0013: .lore/ state directory

## Status

Accepted — 2026-06-21.

Amended — 2026-06-25 (LCLI-46): `.lore/` gains a second committed TOML, **`profile.toml`** (a
`profile.json` form is accepted, lower precedence). It is **separate from `config.toml`**:
`config.toml` carries operational knobs (reconcile/validate/Confluence), while `profile.toml` is
the declarative **type system** — the type vocabulary, per-type frontmatter shape, required
sections, and templates from which lore generates its validators and editor JSON Schemas
(see [ADR-0006 amendment](0006-schema-types-templates.md)). Its `[profile]` table also carries
`resource_base`, the prefix for the `resource` link `lore new` stamps (the stamping itself is
LCLI-47). Like `config.toml`, the profile is **zero-config**: absent — or present with every line
commented — it falls back to the built-in story-convention profile, so `lore init` scaffolds a
fully-commented `profile.toml` that changes nothing until a team fills it in.

Amended — 2026-06-26 (LCLI-47): the `resource_base` key (a key of `profile.toml` `[profile]`,
**not** `config.toml`) is now consumed — `lore new` joins it to a concept's repo-relative path to
stamp the OKF-recommended `resource` link. An **empty** `resource_base` — the default — omits the
`resource` key entirely, so output stays byte-identical to before; index/sub-index files never carry
it, and a profile that declares its own `resource` field keeps ownership (lore does not auto-stamp).

## Context

lore is repo-resident and repo-is-source-of-truth, but it still has a small
amount of state that does not belong in the OKF bundle itself. That state is of
three sharply different kinds, and conflating them — or putting any of it inside
`docs/` — would break the bundle's portability and the tool's zero-config,
agent/CI-safe contract:

1. **Configuration** — knobs a team chooses once and wants version-controlled and
   reviewable: status-reconciliation rules (see
   [ADR-0007: Validation & coherence checking](0007-validation-and-coherence.md)
   for how reconciliation and the drift gate consume them), link/validate
   options, and Confluence target settings. This must be committed so every
   developer, agent, and CI run reads the same rules and `lore check` is
   deterministic across machines.
2. **Derived bookkeeping** — Confluence publish state mapping each doc to its
   `{content_hash, page_id, version, space}`. This is the idempotency ledger for
   the one-way publish adapter; it must be committed so the next publish from any
   machine knows what already exists and only pushes changed docs.
3. **Transient scratch** — capability-probe results for the Backlog.md fork (see
   [ADR-0002: Backlog.md integration](0002-backlog-integration-json-only.md)),
   parse/graph caches, and other recomputable data. This is machine-local, can be
   deleted at any time without loss, and must **not** pollute git history or
   produce spurious diffs in agent loops.

Two further constraints bound the design:

- **The OKF bundle must stay clean.** `docs/` is a valid, `cat`-readable OKF
  bundle on its own (see [ADR-0003: OKF as the documentation substrate](0003-okf-substrate.md)).
  lore's own state must live *outside* `docs/` so the bundle is consumable by any
  OKF tool — GitHub, Obsidian, MkDocs, Docusaurus — with or without lore
  installed, and so a `lore validate` / `lore check` pass over `docs/` never
  trips over lore's plumbing.
- **No new dependency for config parsing.** lore is a thin, single-binary tool
  (see [ADR-0001: Runtime, build & distribution](0001-runtime-build-distribution.md));
  every dependency is weighed against that. The config format must be parseable
  by the runtime we already ship.
- **Secrets must never enter the repo.** A committed config file is exactly the
  wrong place for an API token: it would be checked in, mirrored to every clone,
  and leaked through the bundle. The Confluence credential has to come from the
  environment.

## Decision

**All lore state lives in a single top-level `.lore/` directory**, sibling to
`docs/` and `backlog/`, never inside `docs/`. It holds exactly three things, with
three different lifecycles.

### `.lore/config.toml` — committed configuration

- **Format: TOML, parsed with Bun's native TOML support** — `import`ing a
  `.toml` file (or `Bun.TOML`) is built into the Bun runtime, so lore adds **no
  parsing dependency** for config. TOML is chosen over reusing the bundle's YAML
  precisely so config is unambiguous (no YAML quote-safety footguns) and visibly
  *not* part of the OKF frontmatter surface.
- **Committed to git.** Configuration is a team decision and must be identical for
  every developer, agent, and CI run; checking it in is what makes
  `lore check`'s drift gate reproducible.
- **Contents** (all optional; zero-config defaults apply when absent):
  - **Reconcile rules** — the status-rollup policy (`all tasks Done → done`,
    `any In Progress → in-progress`, …) and any per-repo overrides consumed by
    `lore sync` / `lore check`.
  - **Link & validate options** — an `[validate]` table (`external_links`,
    `promote_portability`) is parsed and validated, but **not yet consumed by
    any command**: `lore check`'s equivalent behavior (external-link
    liveness, promoting portability warnings to errors) is controlled today
    only by its own `--external`/`--strict` flags
    ([ADR-0007](0007-validation-and-coherence.md)). Wiring the config table
    to those defaults, or dropping it, is an open follow-up.
  - **Confluence config** — `base_url`, `space`, `parent_page_id`, and `format`
    (`storage` vs `adf`) for the one-way publish adapter.
- **Zero-config:** lore runs with no `config.toml` at all; the file exists only to
  override defaults. A missing file is not an error.

```toml
# .lore/config.toml
[reconcile]
# all tasks Done -> done; any In Progress -> in-progress; else todo
mode = "task-rollup"

[validate]
# Parsed and validated, but not yet consumed by any command — `lore check`'s
# --external/--strict flags are the actual current controls.
external_links = false      # external liveness opt-in only
promote_portability = false # portability lint stays a warning

[confluence]
base_url       = "https://yourorg.atlassian.net/wiki"
space          = "ENG"
parent_page_id = "98765"
format         = "storage"  # or "adf"
# token via env only: LORE_CONFLUENCE_TOKEN — never stored here
```

### `.lore/sync-state.json` — committed publish bookkeeping

- A JSON ledger keyed by doc path, each entry recording
  `{content_hash, page_id, version, space}`. This is the idempotency mechanism for
  Confluence publish: hash the rendered body, skip unchanged docs (no API call),
  and `PUT version+1` / `POST` only changed ones, then persist the new
  hash/version.
- **Committed** so publish is idempotent and incremental from any machine — the
  next run knows which pages already exist and at what version, instead of
  re-creating or blindly overwriting.
- JSON (not TOML) because it is machine-written and machine-read, never
  hand-authored, and benefits from a trivially serializable shape.

### `.lore/cache/` — gitignored transient data

- Holds recomputable, machine-local scratch: the Backlog.md capability-probe
  result, parse/graph caches, and similar. Safe to delete at any time; lore
  regenerates it on demand.
- **Gitignored.** It must never appear in diffs or history. lore writes a
  `.lore/.gitignore` (or the repo's root ignore) covering `cache/` so this is
  enforced by default, the same way `backlog/.locks/` is ignored (see
  [ADR-0002](0002-backlog-integration-json-only.md)).

### Secrets: environment-only, never stored

- **The Confluence API token is never written to `.lore/` (or anywhere in the
  repo).** It is read exclusively from the environment variable
  **`LORE_CONFLUENCE_TOKEN`**. `config.toml` carries only non-secret Confluence
  *configuration* (URL, space, parent, format); the credential stays in the
  environment / CI secret store.
- The publish adapter fails loud with a clear, actionable error when
  `LORE_CONFLUENCE_TOKEN` is unset, rather than silently degrading.

## Consequences

### Positive

- **Clean, portable OKF bundle.** Keeping every byte of lore state in `.lore/`
  leaves `docs/` a pristine OKF bundle consumable without lore
  ([ADR-0003](0003-okf-substrate.md)); validators and renderers never see lore
  plumbing.
- **No new dependency for config.** Bun-native TOML parsing means config support
  costs zero added packages and zero binary weight, honoring the thin-tool
  constraint of [ADR-0001](0001-runtime-build-distribution.md).
- **Deterministic, reviewable behavior.** Because `config.toml` is committed,
  reconcile rules are identical across every developer, agent, and CI run, so
  `lore sync`/`lore check`'s reconciliation is reproducible and config changes
  are diffable and reviewable.
- **Cheap, idempotent publish.** The committed `sync-state.json` ledger lets
  publish skip unchanged docs with no API call and run safely on every merge from
  any machine.
- **Quiet agent/CI loops.** Gitignoring `cache/` keeps the working tree clean —
  no spurious diffs from probe results or graph caches in tight `lore` loops.
- **Secrets stay out of git by construction.** Environment-only tokens cannot be
  committed by accident; the repo never carries a credential.
- **Clear separation by lifecycle.** Three artifacts, three jobs, three git
  policies (config committed, ledger committed, cache ignored) — easy to reason
  about and to audit.

### Negative / tradeoffs

- **Two config dialects in one repo.** The bundle uses YAML frontmatter while
  `.lore/config.toml` uses TOML. Contributors must keep the two straight. The
  tradeoff is deliberate: TOML keeps config unambiguous and visibly distinct from
  OKF content, and the cost is one well-documented boundary.
- **Bun-native TOML couples config to the runtime.** Relying on `Bun.TOML` means
  the launcher's Node `.cjs` shim cannot parse config (it only resolves and
  hands off to the Bun binary, so this is acceptable), and a future runtime
  change would need a TOML shim. Accepted given the stack-parity decision in
  [ADR-0001](0001-runtime-build-distribution.md).
- **`sync-state.json` is committed derived data.** A machine-generated file in git
  can produce merge conflicts on its hash/version entries when two branches both
  publish. Mitigation: it is keyed by doc path and small; conflicts are
  mechanical and the ledger is self-healing on the next publish (a wrong hash at
  worst causes one redundant re-publish).
- **Operator burden for the token.** Requiring `LORE_CONFLUENCE_TOKEN` in the
  environment means publish fails until the secret is provisioned in CI / the
  shell. This is the intended cost of never storing credentials in the repo.
- **`.lore/` is lore-specific, not OKF.** A consumer that only understands OKF
  ignores `.lore/` entirely (correct), but it is one more top-level directory
  alongside `docs/` and `backlog/` that contributors must learn.

## Alternatives considered

- **A committed `config.yaml` reusing the bundle's YAML stack.** Rejected: it
  would blur the line between OKF frontmatter and lore config, re-import all of
  YAML's quote-safety footguns into a settings file, and make it visually
  ambiguous whether a YAML file is bundle content or tool config. TOML is
  unambiguous and Bun parses it natively.
- **A JSON config (`config.json`).** Rejected for the human-edited config file:
  JSON has no comments and is fussy to hand-author. JSON is the right choice for
  the *machine-written* `sync-state.json` ledger, and that is where we use it.
- **Storing config inside `docs/` (e.g. `docs/.lore.toml` or root index
  frontmatter).** Rejected: it pollutes the OKF bundle, risks a validator or
  renderer choking on non-content, and breaks the "`docs/` is a valid bundle on
  its own" guarantee of [ADR-0003](0003-okf-substrate.md).
- **Committing `cache/`.** Rejected: probe results and graph caches are
  recomputable and machine-local; committing them creates noisy diffs in agent
  loops and stale-cache bugs across machines. Gitignored is correct.
- **Storing the Confluence token in `config.toml` (even as a placeholder or
  encrypted).** Rejected outright: any in-repo secret is a leak waiting to
  happen and would be mirrored to every clone. Environment-only
  (`LORE_CONFLUENCE_TOKEN`) is the only acceptable channel; this is also the seam
  where the Atlassian MCP could later substitute for direct REST.
- **No persisted publish ledger (diff against Confluence at publish time).**
  Rejected: querying Confluence for every page's current version on every run is
  slow, network-bound, and non-deterministic. A committed `sync-state.json`
  ledger makes publish cheap, incremental, and offline-friendly up to the actual
  API writes.

## Related

- [ADR-0001 — Runtime, build & distribution](0001-runtime-build-distribution.md)
  — the thin single-binary / Bun-native rationale behind zero-dependency config.
- [ADR-0002 — Backlog.md integration: JSON-only via `--json`](0002-backlog-integration-json-only.md)
  — the capability-probe cache that lives in `.lore/cache/`, and the gitignore
  precedent for transient state.
- [ADR-0003 — OKF as the documentation substrate](0003-okf-substrate.md) — why
  lore state must live outside `docs/`.
- [ADR-0007 — Validation & coherence checking](0007-validation-and-coherence.md)
  — consumer of the reconcile rules in `config.toml` (the `[validate]` table
  is parsed but not yet consumed — see the Decision section above).
- [Architecture](../reference/architecture.md) — how `.lore/`, the core, and the
  adapters fit together.
- [lore design spec](../specs/lore-design.md) — overall design context.
- [ADR log](index.md).
