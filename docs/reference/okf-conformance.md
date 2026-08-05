---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: OKF conformance
description: How lore conforms to Google Open Knowledge Format v0.1, where its story convention sits as a producer profile, and where it deliberately goes beyond OKF.
tags: [okf, conformance, frontmatter, links, producer-profile, validation]
summary: lore's docs/ bundle is a conformant OKF v0.1 bundle; the story convention is a producer profile and lore adds strict per-type validation plus a relative-link convention on top.
timestamp: 2026-06-21T00:00:00Z
---

# OKF conformance

lore produces a **Google Open Knowledge Format (OKF) v0.1** bundle under
`docs/`. The bundle is conformant on its own — `cat`-readable,
GitHub-renderable, and consumable by any OKF-aware tool with or without lore
installed. This page states the OKF rules lore relies on, maps lore's
**story convention** onto OKF as a *producer profile*, and is explicit about
the two places where lore goes **beyond** OKF.

Canonical spec:
<https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf>
(referenced throughout as OKF §N).

## Version negotiation and migration

The built-in producer profile now targets **OKF 0.2**, so a new bundle created
by `lore init` carries `okf_version: "0.2"` on its root `index.md`. A custom
profile may explicitly target either `0.1` or `0.2`; any other producer target
is a validation error (exit `6`) because lore cannot promise emission semantics
it does not implement.

Consumption is negotiated independently from production. lore parses the one
root `okf_version` declaration into typed bundle state and threads that state
through bundle loading, schema validation, template generation, and
`lore check`:

- Declared `0.1` and `0.2` bundles use their matching semantics.
- A missing declaration is classified explicitly as `legacy-missing` and uses
  `0.1` semantics without a new warning; this keeps pre-negotiation bundles
  byte-stable while making the fallback visible to code.
- A present non-string or empty declaration is malformed and fails validation.
- An unknown future string is retained and consumed best-effort with current
  `0.2` semantics plus a warning, following OKF 0.2 §12.

There is no automatic or in-place `0.1 -> 0.2` upgrade. Reads, validation,
checks, and ordinary writes never rewrite the root declaration or migrate
existing concepts as a side effect. Field-level migration is reserved for an
explicit user action in the corresponding OKF 0.2 migration work. This
repository therefore remains a declared `0.1` bundle until such an action is
requested.

## What OKF v0.1 actually requires

OKF is intentionally minimal. A bundle is a directory tree of Markdown files,
each with optional YAML frontmatter, and the rules are deliberately loose so
that many independent producers and consumers can interoperate.

### Frontmatter

- **`type` is the only required field.** Every concept file's frontmatter must
  carry a non-empty `type`. Its value is producer-defined — OKF assigns no
  closed vocabulary.
- **Recommended (not required) fields:** `title`, `description`, `resource`,
  `tags`, `timestamp`. Producers may add any other keys.
- **Unknown keys and unknown `type` values are allowed.** Consumers MUST
  tolerate them rather than erroring (OKF §9).

### The graph

- Cross-links between files form a **graph** of concepts (OKF §5). Links are
  ordinary Markdown links; the set of inbound/outbound links is the knowledge
  graph a consumer can traverse.
- Consumers MUST **tolerate broken links** — a dangling link is a quality
  signal, not a parse failure.

### Reserved files

- **`index.md`** is the reserved bundle entry point. The **bundle-root**
  `index.md` is the only file that carries **`okf_version`**. Sub-directory
  `index.md` files are allowed as local entry points and carry no
  `okf_version`.
- **`log.md`** is the reserved change-log file.

### §9 conformance, concretely

A bundle conforms when, for every file:

1. frontmatter (if present) is **parseable YAML**;
2. each concept file has a **non-empty `type`**;
3. reserved files (`index.md`, `log.md`) follow the reserved structure, and the
   root `index.md` carries `okf_version`;
4. consumers can ignore anything they don't recognize (unknown types, unknown
   keys, broken links) without failing.

That is the floor lore guarantees. lore's
[`lore validate`](./cli-surface.md) command checks exactly this §9 floor as its
top, error-level tier, before any stricter producer-profile checks run. See
[OKF conformance and validation tiers](./okf-conformance.md#how-lore-checks-conformance)
below.

## lore as an OKF producer: the story convention

OKF defines no `type` vocabulary, so lore supplies one as a **producer
profile**. A producer profile is a convention layered *inside* OKF's tolerance
window: it constrains what *lore* emits and validates, but never narrows what
an OKF *consumer* must accept.

lore's profile defines six `type` values:

| `type` | Role | Typically links to |
|---|---|---|
| `Epic` | A large body of work | child `Story` concepts |
| `Story` | A unit of deliverable behavior | Backlog.md task IDs, `Spec`, `ADR` |
| `Spec` | Design/spec for a feature | `Story`, `ADR`, code paths |
| `ADR` | Architecture decision record | `Spec`, other `ADR` |
| `Runbook` | Operational procedure | `Reference`, resources |
| `Reference` | Stable factual concept (schema, API, metric) | anything |

Beyond these six, lore's profile uses a small set of **recommended frontmatter
fields** drawn from OKF's recommended set plus a lore-specific addition:

- `title`, `description`, `tags`, `timestamp` — OKF-recommended, used directly.
- `summary` — a lore profile field (one sentence). It is not an OKF field, so
  it passes through to consumers as an unknown key; lore uses it for index
  listings, query snippets, and the neighbor compaction in
  [`lore context`](./cli-surface.md). lore warns when it is missing or much
  longer than ~200 characters.
- Coupling fields (`tasks`, `specs`, `supersedes`, `superseded_by`, …) — lore
  profile fields that drive the Backlog.md coupling and refactoring graph; see
  [Backlog CLI contract](./backlog-cli-contract.md).

### Why this stays conformant

- **Closed for lore, open for OKF.** Known types are validated strictly (next
  section), but lore never rejects a *consumer's* unknown type — it only refuses
  to *produce* one unless the user defines it.
- **User-defined types and custom frontmatter pass through untouched.** A user
  can author a `type: Glossary` concept with arbitrary keys; lore treats it with
  OKF tolerance (lenient, `type`-only validation) and leaves its frontmatter
  byte-for-byte intact on write. See
  [Schema, types & templates](../adr/0006-schema-types-templates.md).
- **`okf_version` discipline.** Only the bundle-root
  [`docs/index.md`](../index.md) carries `okf_version: "0.1"`. Concept files and
  sub-index files (e.g. [`docs/adr/index.md`](../adr/index.md)) do not — putting
  `okf_version` on a concept file is itself a conformance warning lore emits.

## Where lore goes beyond OKF

lore is a *producer*, so it can hold itself to a higher bar than OKF requires of
a consumer. Two additions are deliberate, and both are documented here so they
are not mistaken for OKF rules.

### 1. Strict per-type validation for known types

OKF only requires a non-empty `type`. lore additionally validates the
**shape** of each *known* type against a per-type schema, with **Zod as the
single source of truth** ([ADR-0006](../adr/0006-schema-types-templates.md)):

- **Known types** (`Epic`/`Story`/`Spec`/`ADR`/`Runbook`/`Reference`) are
  validated **strictly** — required frontmatter fields, field types, and
  required body sections (e.g. a `Story` needs Acceptance criteria). A failure
  here is a `lore validate` **error** (exit `6`).
- **Unknown types** fall back to **lenient, `type`-only** validation — exactly
  OKF's floor. Extra keys on a known type, and any unknown type, surface as
  **warnings**, never errors, preserving OKF tolerance for downstream tools.

This is a producer-side tightening only. It never changes what lore *accepts*
from another tool's bundle; it changes what lore is willing to *emit and
certify* as its own. Full tiering lives in
[Validation & coherence checking](../adr/0007-validation-and-coherence.md).

### 2. Relative cross-links (overriding OKF §5's recommendation)

OKF §5 **recommends** `/`-absolute, bundle-root-relative links (e.g.
`/reference/orders.md`) but also **permits** ordinary relative links. lore
deliberately chooses the relative form for every link it emits:

> **relative, URL-encoded, `.md`-suffixed, with no leading slash** —
> e.g. `[orders](../reference/orders.md)`.

This **overrides OKF §5's recommendation** while staying **§5-allowed** (§5
also permits relative links). The reason is purely about real-world consumers:
the relative `.md` form is the only link shape that resolves identically on
**GitHub**, in **Obsidian** (including graph + backlinks), under **MkDocs**, and
under **Docusaurus** simultaneously. lore emits **no wikilinks**.

lore enforces this with a **portability lint** (warning-level) that flags
non-portable link syntax, and rewrites links graph-aware during
`lore rename`/`lore supersede`. lore does *not* guarantee cross-renderer
visual parity — that is the consumers' job. Details:
[Portable Markdown](./portable-markdown.md),
[Consumer compatibility](./consumer-compatibility.md), and
[ADR-0010 — Multi-consumer docs layer & link convention](../adr/0010-multi-consumer-docs-layer.md).

## How lore checks conformance

Conformance is enforced by two complementary commands, both deterministic and
CI/agent-safe (see [CLI contract](./cli-contract.md) for exit codes):

| Command | Scope | OKF relationship |
|---|---|---|
| [`lore validate`](./cli-surface.md) | Per-file frontmatter + body shape | **Tier 1 (error):** OKF §9 conformance — parseable frontmatter, non-empty `type`, reserved-file structure. **Tier 2 (error):** strict per-type shape for known types. **Tier 3 (warning):** unknown type / extra keys — preserving OKF tolerance. Plus frontmatter quote-safety. |
| [`lore check`](./cli-surface.md) | Whole-bundle graph | Drift gate (status reconciliation, managed blocks) + **internal link & heading-anchor validation** against the OKF §5 graph (hand-rolled over the shared mdast tree, pure JS; internal by default, `--external` opt-in) + portability lint. Exit `6` on drift. |

`lore validate` answers "is this a conformant OKF bundle that also satisfies
the lore profile?"; `lore check` answers "is the graph and its coupling
coherent?". Broken internal links are reported by `lore check` (and treated as
drift), even though a *consumer* must tolerate them — lore holds its own output
to a higher standard than OKF requires of readers.

## Conformance checklist

A lore-produced bundle is conformant when:

- [x] Root [`docs/index.md`](../index.md) carries `okf_version: "0.1"`; no other
  file does.
- [x] Every concept file has a non-empty `type` and parseable YAML frontmatter.
- [x] Reserved `index.md` (and optional `log.md`) follow reserved structure.
- [x] Known-type files pass strict per-type validation; unknown types pass the
  lenient §9 floor.
- [x] All cross-links are relative, URL-encoded, `.md`-suffixed, no leading
  slash, no wikilinks.
- [x] `lore validate` exits `0`; `lore check` exits `0` (no drift, no broken
  internal links).

## See also

- [Portable Markdown](./portable-markdown.md) — the cross-link rule and lint.
- [Consumer compatibility](./consumer-compatibility.md) — how the one bundle
  renders across GitHub, Obsidian, MkDocs, and Docusaurus.
- [lore design spec](../specs/lore-design.md) — the end-to-end design.
- [ADR-0003 — OKF as the documentation substrate](../adr/0003-okf-substrate.md)
- [ADR-0006 — Schema, types & templates](../adr/0006-schema-types-templates.md)
- [ADR-0007 — Validation & coherence checking](../adr/0007-validation-and-coherence.md)
- [ADR-0010 — Multi-consumer docs layer & link convention](../adr/0010-multi-consumer-docs-layer.md)
- [Agent onboarding](../runbooks/agent-onboarding.md) — how an agent uses the bundle.
