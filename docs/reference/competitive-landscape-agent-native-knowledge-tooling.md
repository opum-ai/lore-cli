---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: "Competitive landscape: agent-native knowledge tooling"
description: >-
  The field Lore sits in, mapped from a two-pass research campaign on
  2026-08-12/13. Records eleven surrounding categories, names the genuine
  competitors in each, and documents the campaign's central discovery — that
  OKF already has a competing implementation ecosystem, so Lore's format bet is
  shared rather than lonely. Carries per-tool verified metadata, the
  Obsidian-ecosystem findings, and an explicit statement of what the research
  failed to cover.
tags:
  - competitive
  - landscape
  - research
  - okf
  - agents
  - knowledge-graph
summary: >-
  Eleven categories surround Lore; only four hold genuine competitors, and the
  OKF implementation ecosystem inside one of them is the finding that matters
  most.
timestamp: 2026-08-13T02:03:19.858Z
---

# Competitive landscape: agent-native knowledge tooling

This is the field survey behind
[the feature matrix](lore-competitive-feature-matrix.md) and
[the adoption roadmap](../specs/lore-competitive-adoption-roadmap.md). The
deepest single teardown has its own page:
[claude-obsidian](claude-obsidian-teardown.md).

**Method.** Two research passes on **2026-08-12/13**. Pass 1 fanned out over
the Obsidian and Claude-integration ecosystem with three-vote adversarial
verification per claim (103 agents); it verified six tools thoroughly and
**refuted eleven claims**, several of them negative capability claims. Pass 2
was a structured per-category survey of everything pass 1 missed, with
adversarial verification on the claims that threatened Lore's differentiation.
Repository metadata in this page was additionally re-checked directly against
`gh api` by the authoring session. Raw capture, including each pass's own
statement of what it failed to cover, is in
[`research/2026-08-12-agent-knowledge-tooling/`](../../research/2026-08-12-agent-knowledge-tooling/README.md)
— which sits deliberately outside the OKF bundle, and is therefore **not**
covered by `lore check`'s link gate (see
[the matrix](lore-competitive-feature-matrix.md)); those two links were
verified by hand.

**How to read a capability claim here.** `unknown` is not `no`. A capability is
recorded absent only where absence was positively checked. Where a verifier
refuted a claim without establishing its opposite, the cell is unknown — a
refuted negative does not license writing the positive. Every number is a
**then-current observation on 2026-08-12/13**; six of the surveyed repositories
had activity on the survey date itself.

## The finding that reframes everything: OKF is contested ground

Lore's own documentation treats OKF as an upstream format it consumes and
produces. That framing is now incomplete. As of 2026-08-12 there is a **working
implementation ecosystem** around the spec, and Lore is one entrant in it
rather than the only one.

| Repository | Stars | License | Last push | What it is |
|---|---:|---|---|---|
| [`GoogleCloudPlatform/knowledge-catalog`](https://github.com/GoogleCloudPlatform/knowledge-catalog) | 8,539 | Apache-2.0 | 2026-08-12 | The normative home: `okf/SPEC.md` v0.2, a Gemini+BigQuery enrichment agent, a Cytoscape viewer |
| [`langchain-ai/openwiki`](https://github.com/langchain-ai/openwiki) | 14,956 | MIT | 2026-08-13 | LLM-authored codebase wiki that emits OKF **v0.1** — the reach leader |
| [`scaccogatto/okf-skills`](https://github.com/scaccogatto/okf-skills) | 254 | MIT | 2026-08-05 | The de-facto v0.2 conformance checker, wrapped as a composite GitHub Action |
| [`serradura/okf-gem`](https://github.com/serradura/okf-gem) | 120 | Apache-2.0 | 2026-08-13 | Ruby toolkit positioned exactly where Lore is; ships an MCP server and a bundle registry |
| [`jyjeanne/okf-rs`](https://github.com/jyjeanne/okf-rs) | 72 | Apache-2.0 OR MIT | 2026-08-07 | Rust tree-sitter code-to-OKF generator; `--check-determinism`, `impact`, PR-review action |
| [`openknowledge-sh/openknowledge`](https://github.com/openknowledge-sh/openknowledge) | 43 | Apache-2.0 | 2026-08-11 | Go CLI, 27 documented commands — the broadest surface; **telemetry on by default** |
| [`okfcli/okf`](https://github.com/okfcli/okf) | 17 | Apache-2.0 | 2026-08-05 | Single-binary Go CLI implementing v0.2 end to end; SARIF output, stable rule IDs |
| [`gsemet/okf-schema`](https://github.com/gsemet/okf-schema) | 14 | MIT | 2026-08-10 | Per-type JSON Schema validation — and openly declares that this makes it non-conformant |
| [`travisjakel/okf-mcp`](https://github.com/travisjakel/okf-mcp) | 6 | Apache-2.0 | 2026-08-10 | MCP surface over a bundle |
| [`travisjakel/okf-ingest`](https://github.com/travisjakel/okf-ingest) | 4 | Apache-2.0 | 2026-08-06 | Deterministic LLM-free consume-side engine: `context`/`impact`/`diff`/`rank` |
| [`open-doc-spec/ods`](https://github.com/open-doc-spec/ods) | 4 | Apache-2.0 | 2026-08-12 | A **rival spec** with a Rust CLI that has absorbed OKF as a flag (`ods lint --okf`) |

Four consequences follow, and they are more strategically important than
anything in the Obsidian half of the research.

**The spec owner ships no validator.** A scan of the knowledge-catalog
repository found no validator, no JSON Schema, and no linter. The normative
owner publishes semantics and leaves conformance tooling to others. That is the
vacuum every CLI above is filling, Lore included — and it means "OKF-native" is
a claim no upstream authority currently adjudicates.

**Determinism is table stakes, not an edge.** `okfcli`, `okf-gem`,
`okf-ingest`, `okf-rs`, `iwe`, `ods`, `zetl`, `Foam`, and `Mnemosyne` are all
deterministic. `okf-ingest` was verified byte-identical across three runs.
Lore's README leads with a deterministic no-LLM core; on this evidence that
sells a floor, not a differentiator.

**The volume winner in OKF output is LLM-authored, by two orders of
magnitude.** `langchain-ai/openwiki` (14,956 stars) generates OKF v0.1 with a
model; the whole deterministic authoring cohort is a few hundred stars
combined. Lore's bet is not lonely, but it is the minority bet by reach.

**A rival spec has published a framing that puts Lore on the wrong side of
it.** `open-doc-spec/ods` argues ODS is for docs describing **software
systems** and OKF is for docs describing **data and knowledge assets**. If that
framing sticks, an OKF-native CLI aimed at a code repository is fighting the
spec's grain. This deserves a written answer rather than silence; the honest
counter is that Lore's concepts (ADR, Spec, Runbook, Story) are *decisions
about* a system rather than *descriptions of* it, and that OKF's trust,
staleness, and provenance families are exactly right for decisions that rot.

## Field map

Eleven categories surround Lore. Four contain genuine competitors.

| Category | Best representative | Competitor? |
|---|---|---|
| OKF spec home | `GoogleCloudPlatform/knowledge-catalog` | Adjacent — Lore's upstream, and it ships no conformance tooling |
| **OKF authoring/validating CLIs** | `okfcli/okf` | **Yes — the head-to-head category** |
| **OKF consume-side engines** | `travisjakel/okf-ingest` | **Yes, for the read half.** Owns `context`/`impact`/`diff`/`rank` and deliberately does not author |
| Code-to-OKF generators | `jyjeanne/okf-rs` | Adjacent — different input, overlapping output |
| **Rival repo-resident doc specs** | `open-doc-spec/ods` | **Yes — the sharpest strategic competitor** |
| LLM-authored wiki producers | `langchain-ai/openwiki` | Adjacent, opposite bet, reach leader |
| Spec-driven development | `Fission-AI/OpenSpec` (64,700) | Adjacent — requirements, not decisions |
| Task trackers | `MrLesk/Backlog.md` (6,451) | A dependency, not a competitor |
| Agent-memory engines | `getzep/graphiti` (29,866) | Not competitors — database substrate, LLM extraction |
| **PKM graph engines** | [`zetl`](https://codeberg.org/anuna/zetl) | **Yes by feature overlap, near-zero by adoption** |
| Distribution surfaces | MCP Resources, llms.txt, AGENTS.md | Export targets, not rivals |

### The two PKM competitors that matter

**`zetl`** (Codeberg, AGPL-3.0-or-later, Rust, v0.9.3, alpha) has the deepest
feature overlap of anything surveyed: typed named edges via predicates
(`derived_from::[[X]]`), `path`, `backlinks`, `check --dead-links`, orphan
detection, content-addressable BLAKE3 blocks, an MCP server with scoped
signed-JWT delegation, `--at "3 days ago"` time travel as a **global flag**
honored by every read command, a defeasible reasoning engine, RDF export, CRDT
co-editing, and a self-installing `zetl skill init` that embeds the agent skill
in the binary so skill and CLI version together. Its adoption is negligible.
Treat it as a feature roadmap written by someone else, not as a market threat.

**`Foam`** (17,344 stars, packages declare MIT) is the credible *mainstream*
competitor: no longer only a VS Code extension, it now ships a published
headless CLI and a 25-tool MCP server with an explicit `mode: 'read' |
'read-write'`.

Two negatives worth recording. **Dendron is dead** — its README says
"maintenace only, active development has stopped" (sic), last substantive code
commit 2024-04-17. **Logseq's CLI cannot be pointed at a repository's
`docs/`**: it targets a SQLite graph under `~/logseq/graphs`.

## The Obsidian half

Pass 1's verified findings, condensed. The full claim set with vote counts is
in
[`01-obsidian-ecosystem-verified-claims.md`](../../research/2026-08-12-agent-knowledge-tooling/01-obsidian-ecosystem-verified-claims.md).

[`AgriciDaniel/claude-obsidian`](https://github.com/AgriciDaniel/claude-obsidian)
(10,807 stars, MIT) is the headline project and has
[its own teardown](claude-obsidian-teardown.md). The structurally important
fact is that it is **a Claude Code plugin and Agent Skills package, not an MCP
server** — verified not by README absence but by a repo-wide enumerating grep
for MCP implementation markers returning zero hits, no `mcpServers` key in
`plugin.json`, and no HTTP client anywhere in the core. Its GitHub topics
include `obsidian-plugin` and `claude-plugin`, which are SEO tags and will
mislead a casual reader; it is also absent from Obsidian's
`community-plugins.json` (6,606 entries) and has neither `manifest.json` nor
`main.js`, both mandatory for an Obsidian plugin.

The rest of the ecosystem splits into two incompatible architectures:

- **REST proxies.**
  [`MarkusPfundstein/mcp-obsidian`](https://github.com/MarkusPfundstein/mcp-obsidian)
  (4,292 stars, MIT) has no disk access at all — every operation is an HTTP
  call to the Local REST API plugin on `127.0.0.1:27124`, so **the Obsidian
  desktop app must be running**. That makes it unusable as a headless CI gate.
  Its surface is 15 registered tools, not 16 — the sixteenth class is an
  abstract base. Its published PyPI artifact also **lags its source**: 0.2.2
  was uploaded 2025-04-01, before the commits that added `get_frontmatter` and
  `search_by_tag`, and the README documents only 7 of the 15.
- **Filesystem-native.**
  [`StevenStavrakis/obsidian-mcp`](https://github.com/StevenStavrakis/obsidian-mcp)
  (721 stars, MIT) is a standalone Node stdio server with no HTTP client in the
  package. It is ~14 months without a commit while still advertising active
  development.

The substrate itself has moved:
[`coddingtonbear/obsidian-local-rest-api`](https://github.com/coddingtonbear/obsidian-local-rest-api)
(2,788 stars, MIT, 5.1.0) **now ships its own built-in MCP server** inside the
Obsidian app — Streamable HTTP at `/mcp/`, bearer auth, 16 tools including
`vault_get_document_map`, one MCP resource, documented native
`claude mcp add --transport http` setup, and a plugin extension API letting
other plugins register more tools. The tool names were confirmed present in the
released `main.js` asset, not just the docs.

One licensing trap: **Obsidian Smart Connections is not open source.** It
changed on 2025-12-09 to the Smart Plugins License, a source-available license
with a field-of-use non-compete carve-out that fails OSD #6, plus a paid
"Connections Pro" tier. Any source published before December 2025 will say
GPLv3 and will be wrong.

## What the research did not cover

Recorded because a landscape survey that hides its gaps is worse than no
survey. These categories were named in the brief and never reached:

- **Software catalogs** — Backstage `catalog-info.yaml` and TechDocs. A large,
  typed, repo-resident entity catalog with schema validation and a graph. The
  single most significant category gap.
- **Link checkers** — `lychee`, `markdown-link-check`. These are the incumbent
  answer to "gate broken links in CI" and are far more adopted than any OKF
  tool.
- **Prose linters** (Vale, markdownlint, remark-lint),
  **architecture-as-code** (Structurizr, C4, arc42), and **RFC tooling**.

ADR tooling and code-graph tooling **were** covered, contrary to what pass 2's
own synthesis says — that synthesis was written against a truncated payload and
under-reports its own coverage. `npryce/adr-tools` (5,609), `log4brains`
(1,557), MADR (2,392), `mbeacom/adrkit` (6), `adg` (42), SCIP, LSIF, Glean,
Stack Graphs, `ast-grep` (15,490), Sourcebot, Nx project graph, and CodeQL all
returned rows and appear in [the matrix](lore-competitive-feature-matrix.md).
The lesson generalizes: a research pass's self-assessment of its own coverage
is a claim to check, not a fact to inherit.

Additional caveats that constrain how far any cell can be trusted:

- Only four rows were adversarially verified in pass 2 (`okf-ingest`,
  `okf-rs`, `iwe`, `ods`); everything else is single-pass survey data. One in
  four verification attempts produced a refutation, and the refutation came
  from a tool's own help text — `ods diff` is a 34-line
  `git diff --name-status` passthrough that always exits 0 while its help
  claims it "compares document graph changes".
- The two tools most threatening to Lore's differentiation claims —
  `okfcli/okf` and `zetl` — were **never verified against a shipped artifact**.
- The Backlog.md finding that Lore's strongest differentiation leans on was
  probed at **1.49.3** while npm latest was **1.50.1**. Re-verify before
  building anything on it.
- "No MCP server" claims for `spec-kit`, `OpenSpec`, and `BMAD` rest on
  in-repo greps for the literal string `modelcontextprotocol`. Absence of a
  grep hit is not absence of a server.
- GitHub's license field is unreliable: it reports `okf-rs` as Apache-2.0
  (repo is MIT OR Apache-2.0), `BMAD` as NOASSERTION (LICENSE is MIT), and
  `Foam` as NOASSERTION (packages declare MIT). Copyleft to watch if Lore ever
  vendors code: `zetl` AGPL-3.0-or-later, `Logseq` AGPL-3.0, `basic-memory`
  AGPL-3.0. Not OSI-open: `claude-task-master` (MIT WITH Commons-Clause),
  Tessl (proprietary, and its npm package is a 17 KB installer stub that
  cannot be inspected at all).
- Stars measure repository popularity, not format adoption. Nothing here
  measures how many OKF bundles exist or whether any consumer reads
  `stale_after` or Attested Computation.
