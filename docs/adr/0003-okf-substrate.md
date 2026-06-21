---
type: ADR
title: "ADR-0003: OKF as the documentation substrate"
description: Adopt the Google Open Knowledge Format (OKF) v0.1 as lore's on-disk documentation substrate, with the story convention as an OKF producer profile.
tags: [adr, okf, architecture, substrate, frontmatter]
summary: lore's docs/ tree is a conformant OKF v0.1 bundle, and the Epic/Story/Spec/ADR/Runbook/Reference story convention is layered on top as an OKF producer profile.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0003: OKF as the documentation substrate

## Status

Accepted — 2026-06-21.

## Context

lore needs an on-disk format for repo-resident documentation that satisfies several
non-negotiable constraints from the product philosophy:

- **Repo is the single source of truth.** Docs must be plain files that live in the
  repo, render on GitHub, and remain useful with or without lore installed. No
  database, no proprietary container, no build step required to read them.
- **Agent- and human-readable.** The format must be `cat`-able, diff-friendly, and
  trivially parseable by both Claude Code and downstream renderers.
- **Thin, not a reinvention.** lore should not invent a bespoke documentation schema
  it then has to evangelize, version, and defend. A standard that already enjoys
  tooling and consumer tolerance is preferable to a private one.
- **Tolerant of evolution.** The set of document types and frontmatter fields must be
  open: producers add their own types and keys without breaking consumers.

The [Google Open Knowledge Format (OKF) v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
fits all of these. Its salient properties:

- An OKF bundle is simply a **directory of markdown files with YAML frontmatter**.
- The **only required** frontmatter field is `type`. `title`, `description`,
  `resource`, `tags`, and `timestamp` are *recommended*, not mandatory.
- Cross-links between files form a **knowledge graph**.
- `index.md` and `log.md` are **reserved** filenames; `okf_version` appears **only**
  in the bundle-root `index.md`.
- Consumers **MUST tolerate** unknown `type` values, unknown frontmatter keys, and
  broken links — they degrade rather than fail.

This tolerance is exactly what lets a producer impose more structure on top without
violating the standard. The full conformance mapping lives in
[OKF conformance](../reference/okf-conformance.md).

## Decision

**lore's `docs/` tree is a conformant OKF v0.1 bundle, and lore layers an opinionated
"story convention" on top of it as an OKF *producer profile*.**

Concretely:

1. **The bundle is OKF, period.** Every concept file is markdown with YAML
   frontmatter carrying at minimum `type`. The bundle root is `docs/index.md` and is
   the sole carrier of `okf_version: "0.1"`. `docs/log.md` is reserved for the change
   log. Sub-index files (e.g. `docs/adr/index.md`) carry no frontmatter, matching OKF's
   reserved-`index.md` semantics. A bare `docs/` directory is a valid, portable OKF
   bundle that any OKF-aware consumer can read — lore is not required to read it.

2. **The story convention is a producer profile, not a new format.** lore defines six
   recommended `type` values:

   | `type`      | Role                                                    |
   |-------------|---------------------------------------------------------|
   | `Epic`      | A large body of work; parents `Story` concepts          |
   | `Story`     | A unit of deliverable behavior; owns Backlog.md task IDs |
   | `Spec`      | Feature design / spec output                            |
   | `ADR`       | Architecture decision record (this file is one)         |
   | `Runbook`   | Operational procedure                                   |
   | `Reference` | Stable factual concept (schema, API, metric)            |

   These are *recommendations within the producer profile*, expressed as OKF `type`
   values. Nothing in OKF privileges them; they are lore's convention for organizing a
   software project's knowledge graph.

3. **lore validates known types strictly and unknown types leniently.** Zod is the
   single source of truth for frontmatter schemas (see
   [ADR-0006](0006-schema-types-templates.md)). For the six profile types, lore
   applies a *strict* per-type schema (required fields, required sections, frontmatter
   quote-safety). For any other `type`, lore applies a *lenient* `type`-only schema and
   emits a **warning**, never an error — honoring OKF's mandate that consumers tolerate
   unknown types and extra keys. User-defined types and custom frontmatter pass through
   untouched. The tiered `lore validate` behavior is specified in the
   [lore design spec](../specs/lore-design.md) and grounded in
   [OKF conformance](../reference/okf-conformance.md).

4. **Cross-links follow lore's portable-link rule, which OKF §5 permits.** Links are
   relative, URL-encoded, `.md`-suffixed, with no leading slash (e.g.
   `[orders](../reference/orders.md)`). This deliberately chooses the relative form
   over OKF §5's `/`-absolute *recommendation* — both are §5-allowed, but only the
   relative form works across GitHub, Obsidian, MkDocs, and Docusaurus simultaneously.
   The reasoning is recorded in
   [ADR-0007](0010-multi-consumer-docs-layer.md) and the rules in
   [portable Markdown](../reference/portable-markdown.md).

This ADR establishes the substrate; the consumers that read the bundle (browsable
sites, graph tooling) are addressed in
[ADR-0014](0010-multi-consumer-docs-layer.md), and the Backlog.md coupling that the `Story`
type anchors is addressed in [ADR-0004](0002-backlog-integration-json-only.md).

## Consequences

### Positive

- **Zero lock-in, maximum portability.** Because the bundle is just markdown + YAML in
  the repo, every doc renders on GitHub today and is consumable by any OKF tool, by
  MkDocs/Docusaurus/Obsidian (see [consumer compatibility](../reference/consumer-compatibility.md)),
  and by agents via plain `cat` — with or without lore.
- **lore stays thin.** lore does not own a documentation schema; it owns conventions
  and coupling. The format's evolution is OKF's problem, not lore's.
- **Tolerant graph.** OKF's mandated tolerance for unknown types, unknown keys, and
  broken links means producers can extend the profile (new types, project-specific
  frontmatter) without coordinating with lore or breaking consumers. Broken links
  surface as warnings/drift in [`lore check`](../specs/lore-design.md), not as a hard
  authoring failure.
- **The producer profile gives agents a stable vocabulary.** Six well-known types let
  the agent bridge ([agent onboarding](../runbooks/agent-onboarding.md)) and retrieval
  commands reason about the graph (`lore query`, `lore context`) without bespoke
  configuration.
- **Clean conformance story.** "Is this a valid bundle?" reduces to OKF §9
  conformance, which `lore validate` checks deterministically with no LLM dependency.

### Negative / tradeoffs

- **OKF v0.1 is young.** It is a v0.1 specification with a small tooling ecosystem;
  lore is an early adopter and may need to track breaking changes upstream. Mitigation:
  `okf_version` is pinned in the root index and asserted during validation, so version
  drift is detectable.
- **OKF's required surface is minimal.** Requiring only `type` means a "valid" OKF file
  can still be unusable for lore's purposes. lore compensates with the *stricter*
  producer-profile schemas — but that means lore has two tiers of conformance (OKF
  conformance vs. profile conformance) that must be explained and kept distinct (see
  [OKF conformance](../reference/okf-conformance.md)).
- **Tolerance can mask mistakes.** Because unknown types and keys only warn, a typo'd
  `type` (e.g. `Stroy`) downgrades a file to lenient validation instead of failing.
  Mitigation: `lore validate` surfaces the warning, and `summary`/required-section
  expectations on the intended type would otherwise have fired.
- **We diverge from one OKF *recommendation*.** Choosing relative over `/`-absolute
  links is a documented, §5-permitted divergence
  ([ADR-0007](0010-multi-consumer-docs-layer.md)), but it does mean lore-produced
  bundles are not byte-identical to the OKF reference's recommended link style.

## Alternatives considered

- **A bespoke lore documentation schema.** Rejected. It would make lore fat (owning a
  schema, its versioning, and its tooling) and contradict the thin / repo-is-source-of-truth
  philosophy. It would also forfeit OKF's existing consumer tolerance and any future
  OKF ecosystem tooling.
- **Confluence / a wiki as the primary store.** Rejected as the *substrate*. It breaks
  repo-is-source-of-truth, is not `cat`-able or diff-friendly for agents, and is not
  CLI-primary. Confluence remains a deferred one-way *publish target*
  ([ADR-0015](0016-confluence-one-way-publish-deferred.md)), never the source.
- **Docusaurus/MkDocs front-matter conventions as the substrate.** Rejected. These are
  *renderer* conventions, not an interchange standard; coupling the substrate to one
  renderer would undercut cross-renderer portability. Instead lore treats them as
  downstream consumers it scaffolds for, outside `docs/`
  ([consumer compatibility](../reference/consumer-compatibility.md)).
- **Plain markdown with no frontmatter standard.** Rejected. Without a typed,
  machine-readable frontmatter contract there is no graph, no validation, and no
  reliable agent retrieval — exactly the affordances lore exists to provide.
- **OKF with `/`-absolute links per §5's recommendation.** Considered and partially
  adopted: we keep OKF but choose the §5-permitted *relative* link form for
  cross-renderer portability, as detailed in
  [ADR-0007](0010-multi-consumer-docs-layer.md).
