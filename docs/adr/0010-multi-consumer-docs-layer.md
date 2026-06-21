---
type: ADR
title: "ADR-0010: Multi-consumer docs layer & link convention"
description: Generated cross-links are relative, URL-encoded, .md-suffixed, with no leading slash and no wikilinks — the one form that resolves across GitHub, Obsidian, MkDocs/Material, and Docusaurus — and lore scaffolds per-tool configs additively outside docs/ while linting for non-portable syntax without guaranteeing cross-renderer parity.
tags: [adr, links, portability, consumers, mkdocs, docusaurus, obsidian, scaffolding]
summary: lore emits relative, URL-encoded, .md-suffixed cross-links with no leading slash and no wikilinks, scaffolds MkDocs/Docusaurus/Obsidian configs outside docs/, and lints non-portable syntax without promising cross-renderer parity.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0010: Multi-consumer docs layer & link convention

## Status

Accepted — 2026-06-21.

## Context

The `docs/` bundle is a conformant OKF v0.1 directory of markdown
([ADR-0003](0003-okf-substrate.md)). Its whole value proposition is that the same
files are read, unchanged, by many consumers:

- **GitHub** (and any plain `cat`/diff viewer), which renders `docs/` as-is with no
  build step — the baseline the repo-is-source-of-truth philosophy depends on.
- **Obsidian**, which gives humans a graph view and backlinks over the same files.
- **MkDocs (Material)** and **Docusaurus**, which compile `docs/` into a browsable
  static site for non-repo audiences.
- **Agents** (Claude Code) and OKF tooling, which traverse the cross-link graph.

These consumers do not agree on how a link should be written. The single most
load-bearing — and most fragile — decision in the bundle is therefore the **form of an
internal cross-link**, because the OKF graph is *made of* links and a link that
resolves in one renderer and 404s in another silently fragments the graph.

The relevant constraints, gathered in
[consumer compatibility](../reference/consumer-compatibility.md) and codified in
[portable Markdown](../reference/portable-markdown.md):

- **GitHub** resolves repo-relative paths and requires the `.md` suffix to render the
  target inline; it does not resolve extensionless or `/`-absolute doc paths to files.
- **Obsidian** builds its graph and backlinks from relative markdown links; it tolerates
  but does not require wikilinks, and `[[wikilinks]]` are not understood by GitHub,
  MkDocs, or Docusaurus.
- **MkDocs** resolves relative `.md` links and rewrites them at build; absolute paths
  are resolved against the *site* root, not the docs root, so a leading slash breaks.
- **Docusaurus** resolves relative `.md`/`.mdx` links, but treats `/`-absolute paths as
  site routes and is sensitive to raw `<` and `{` (it parses MDX). It needs
  `markdown.format: 'detect'` so plain-CommonMark files with stray `<` or `{` are not
  fed to the MDX parser, and broken-link handling set to `warn` so a single dangling
  link does not fail the whole build.

OKF §5 *recommends* `/`-absolute, bundle-relative links and *also permits* relative
links. The §5 recommendation is the one form on the list above that GitHub, Obsidian,
MkDocs, and Docusaurus do **not** uniformly resolve. So the recommendation, taken
literally, is incompatible with the multi-consumer goal.

A further reality: only **Obsidian** offers a graph/backlinks experience over these
files. GitHub, MkDocs, and Docusaurus render pages and links but do not surface an
interactive concept graph. lore's own `lore graph` reconstructs that view for everyone
else; the in-renderer graph is, by design, an Obsidian-only affordance.

## Decision

**lore generates exactly one cross-link form, scaffolds per-tool configs additively
outside `docs/`, and lints for non-portable syntax — but does not guarantee that every
renderer produces identical output.**

### 1. The canonical link form

Every internal cross-link lore writes — in scaffolded concepts, regenerated index/log
files, managed `lore:tasks` blocks, and graph-aware rewrites — is:

- **relative** (computed from the linking file's directory, e.g. `../reference/orders.md`),
- **URL-encoded** (spaces and other reserved characters percent-encoded, e.g.
  `task-42%20-%20Bulk%20archive.md`),
- **`.md`-suffixed** (the link points at the file, not an extensionless route),
- with **no leading slash** (never `/reference/orders.md`),
- and **no wikilinks** (never `[[orders]]`).

```markdown
<!-- correct -->
[orders](../reference/orders.md)

<!-- wrong: leading slash (OKF §5 recommendation, but breaks MkDocs/Docusaurus) -->
[orders](/reference/orders.md)

<!-- wrong: no extension (breaks GitHub file rendering) -->
[orders](../reference/orders)

<!-- wrong: wikilink (breaks GitHub/MkDocs/Docusaurus) -->
[[reference/orders]]
```

This is the **only** form that resolves across GitHub, Obsidian (and feeds its
graph/backlinks), MkDocs/Material, and Docusaurus simultaneously. It is the link rule
shared by [ADR-0003](0003-okf-substrate.md) and applied by every link-writing command —
`lore new`, `lore sync`/index generation, `lore link`, `lore replace`, `lore rename`,
and `lore supersede`. The form is a deliberate, OKF §5-permitted override of §5's
`/`-absolute *recommendation*; both are §5-allowed.

### 2. Scaffolding is additive and lives outside `docs/`

`lore scaffold <mkdocs|docusaurus|obsidian>` writes each consumer's config files **next
to**, never inside, the OKF bundle, so `docs/` stays a pure, renderer-agnostic OKF
directory:

- `lore scaffold mkdocs` — `mkdocs.yml` (Material theme, `docs_dir: docs`), pointing the
  site at the existing bundle.
- `lore scaffold docusaurus` — Docusaurus config with **`markdown.format: 'detect'`** (so
  CommonMark files containing raw `<` or `{` are not parsed as MDX) and broken-link
  handling set to **`warn`** (a dangling link warns rather than failing the build).
- `lore scaffold obsidian` — a `.obsidian/` vault config tuned for relative-link
  resolution, so the graph and backlinks operate over the canonical link form.

Scaffolding is additive and idempotent: it does not move, rename, or restructure files
under `docs/`, and re-running it produces a clean diff. Consumers can also be configured
by hand; `lore scaffold` is a convenience, not a dependency.

### 3. lore lints non-portable syntax but does not guarantee parity

`lore check` includes a **portability lint** that *detects* and **warns** on syntax that
will not survive all four renderers — leading-slash links, extensionless internal links,
`[[wikilinks]]`, and other non-portable constructs flagged in
[portable Markdown](../reference/portable-markdown.md). The lint is part of the same
whole-bundle, pure-JS pass as internal link and heading-anchor validation
(remark-validate-links; see [validation & coherence](0007-validation-and-coherence.md)),
internal-by-default with external liveness opt-in, and no Rust/lychee runtime dependency.

The lint is a **portability warning, not a rendering guarantee.** lore asserts that the
links it generates are portable and flags author-introduced syntax that is not. It does
**not** promise byte-identical or visually-identical output across GitHub, Obsidian,
MkDocs, and Docusaurus — admonition syntax, callouts, math, diagram extensions, and HTML
handling differ per renderer, and reconciling them is the consumers' job, not lore's.

## Consequences

### Positive

- **One link form, four renderers.** The single canonical link resolves on GitHub, in
  Obsidian's graph/backlinks, and through MkDocs and Docusaurus builds, so the OKF graph
  stays intact wherever the bundle is read.
- **`docs/` stays pure OKF.** Because every scaffolded config lives outside the bundle,
  `docs/` remains a renderer-agnostic OKF directory — portable, `cat`-able, and
  consumable with or without lore ([ADR-0003](0003-okf-substrate.md)).
- **Deterministic, agent-safe link generation.** Every link-writing command emits the
  same form with no LLM dependency, so graph-aware rewrites
  ([refactoring & graph operations](../reference/cli-surface.md)) and managed
  blocks are idempotent and produce clean diffs.
- **Portability regressions are caught early.** The portability lint surfaces
  non-portable syntax as a `lore check` warning (exit 6 on drift), so problems are caught
  in CI rather than discovered as 404s in a published site.
- **Low-friction publishing.** `lore scaffold` makes standing up a MkDocs or Docusaurus
  site, or opening the bundle as an Obsidian vault, a one-command, additive operation.

### Negative / tradeoffs

- **Documented divergence from an OKF recommendation.** lore intentionally does not
  emit OKF §5's recommended `/`-absolute links. The choice is §5-permitted and recorded
  here and in [ADR-0003](0003-okf-substrate.md), but lore-produced bundles are not
  byte-identical to the OKF reference's recommended link style, and a strict §5-recommendation
  checker would flag them.
- **No cross-renderer parity guarantee.** Identical *resolution* is guaranteed; identical
  *rendering* is not. Authors who use renderer-specific syntax (Docusaurus admonitions,
  Obsidian callouts, GitHub alerts) get divergent output, and lore only warns where it
  recognizes the construct.
- **Encoding burden.** Requiring URL-encoded, `.md`-suffixed links makes hand-authored
  links easy to get subtly wrong (an unencoded space, a dropped extension). Mitigation:
  lore generates and rewrites links itself, and the portability lint catches the common
  hand-authoring mistakes.
- **Graph is Obsidian-only in-renderer.** Humans who want an interactive concept graph
  must use Obsidian or `lore graph`; MkDocs/Docusaurus/GitHub render pages and links but
  no graph. This is an accepted limitation, not a defect.
- **Scaffold drift.** Tool configs scaffolded outside `docs/` are not regenerated on
  every `lore sync`; if a consumer's expectations change (e.g. a Docusaurus major
  upgrade), the scaffolded config can fall behind and must be re-scaffolded or
  hand-maintained.

## Alternatives considered

- **Follow OKF §5's `/`-absolute recommendation verbatim.** Rejected. It is the one form
  that GitHub does not resolve to files and that MkDocs and Docusaurus resolve against
  the *site* root rather than the docs root — directly defeating the multi-consumer goal.
  §5 also permits relative links, so we stay §5-conformant while diverging from its
  recommendation.
- **Wikilinks (`[[concept]]`).** Rejected. They give Obsidian a nice authoring
  experience but are not understood by GitHub, MkDocs, or Docusaurus, so they fragment
  the graph for three of four consumers.
- **Extensionless links (`../reference/orders`).** Rejected. MkDocs and Docusaurus can be
  configured to resolve them, but GitHub will not render the target inline, breaking the
  zero-build baseline.
- **Per-consumer link rewriting at build time.** Rejected as the *primary* mechanism. It
  would let `docs/` carry any link form and rewrite per target, but it reintroduces a
  build step into the source of truth, makes raw GitHub viewing lossy, and adds a
  rewriter lore would have to own and version per renderer. The publish adapters that do
  need to rewrite links (e.g. Confluence, [ADR-0015](0016-confluence-one-way-publish-deferred.md)) remain
  isolated and do not touch the canonical on-disk form.
- **Guaranteeing cross-renderer parity.** Rejected as out of scope. Normalizing
  admonitions, callouts, math, and diagram syntax across four renderers would make lore
  fat and own a Markdown transpiler — the opposite of thin. lore guarantees link
  *resolution* and lints portability; rendering fidelity is the consumers' responsibility
  ([consumer compatibility](../reference/consumer-compatibility.md)).
