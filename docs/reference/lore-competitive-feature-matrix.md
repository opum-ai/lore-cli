---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Lore competitive feature matrix
description: >-
  The head-to-head capability matrix placing Lore against the tools surveyed on
  2026-08-12/13 — OKF CLIs, rival repo-resident doc specs, PKM graph engines,
  spec-driven frameworks, ADR and code-graph tooling, docs-as-code
  toolchains, and agent-memory engines. Records thirteen capability axes per
  tool, states where Lore is genuinely alone, where it is behind, and which
  cells are unknown rather than absent.
tags:
  - competitive
  - matrix
  - okf
  - agents
  - capabilities
summary: >-
  Thirteen capability axes across the surveyed field, with Lore's own cells
  verified against its source rather than its README.
timestamp: 2026-08-13T02:03:19.858Z
---

# Lore competitive feature matrix

Field survey and method:
[the competitive landscape](competitive-landscape-agent-native-knowledge-tooling.md).
Deepest single teardown: [claude-obsidian](claude-obsidian-teardown.md).
What to do about it:
[the adoption roadmap](../specs/lore-competitive-adoption-roadmap.md).

## How to read a cell

| Symbol | Meaning |
|---|---|
| `Y` | Shipped and documented — a real command, tool, or API was seen |
| `~` | Partial — exists but materially limited (a GUI view rather than a query; a linter that is not wired as a gate) |
| `-` | Positively checked and absent |
| `?` | **Not checked.** Not a claim of absence |

**`?` is the most important symbol in this table.** Roughly a quarter of
verification attempts in this research overturned a survey claim, so an
unchecked cell is genuinely unknown, and a refuted negative never licenses
writing the positive. Every value is a **then-current observation on
2026-08-12/13**.

**Lore's own row was verified against this repository's source**, not against
its README — including one cell that came out worse than the README implies.

## The axes

1. **Typed schema** — per-type schema validation of concept frontmatter
2. **Link gate** — link/anchor integrity enforced with a failing exit code
3. **Graph query** — traversal from the command line (`path`, `impact`, blast radius)
4. **Task coupling** — bidirectional coupling to an external task tracker
5. **No LLM** — deterministic core with no model dependency
6. **JSON + codes** — machine-readable output *and* differentiated exit codes
7. **MCP** — ships a Model Context Protocol server
8. **Skill gen** — generates an agent instruction/skill artifact
9. **Temporal** — snapshot and diff over time
10. **Provenance** — trace a fact to source evidence
11. **Budgeted ctx** — token-budgeted context assembly
12. **Local** — local-first, works offline
13. **Semantic** — embedding/semantic search

## Head-to-head: the tools that actually compete

| Tool | Stars | License | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **lore** | private | MIT | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** | - | **Y** | **Y** | **Y** | ~ | **Y** | - |
| [zetl](https://codeberg.org/anuna/zetl) | 5 | AGPL-3.0+ | ~ | Y | Y | - | Y | Y | Y | Y | Y | Y | ~ | Y | Y |
| [open-doc-spec/ods](https://github.com/open-doc-spec/ods) | 4 | Apache-2.0 | Y | Y | Y | - | Y | ~ | ? | Y | Y | Y | Y | Y | ? |
| [jyjeanne/okf-rs](https://github.com/jyjeanne/okf-rs) | 72 | MIT OR Apache-2.0 | Y | Y | Y | - | Y | ? | Y | ~ | Y | Y | ~ | Y | Y |
| [okfcli/okf](https://github.com/okfcli/okf) | 17 | Apache-2.0 | ~ | Y | Y | - | Y | Y | - | - | - | Y | ~ | Y | - |
| [travisjakel/okf-ingest](https://github.com/travisjakel/okf-ingest) | 4 | Apache-2.0 | ~ | ~ | Y | - | Y | ~ | Y | - | Y | ~ | ~ | Y | Y |
| [serradura/okf-gem](https://github.com/serradura/okf-gem) | 120 | Apache-2.0 | ~ | ~ | ~ | - | Y | Y | Y | Y | ? | ~ | ~ | Y | - |
| [scaccogatto/okf-skills](https://github.com/scaccogatto/okf-skills) | 254 | MIT | ~ | Y | ~ | - | ~ | Y | ? | Y | ? | Y | ? | Y | ? |
| [openknowledge-sh/okn](https://github.com/openknowledge-sh/openknowledge) | 43 | Apache-2.0 | ~ | ? | ? | - | ~ | ? | Y | ~ | ? | ? | ? | ~ | ? |
| [gsemet/okf-schema](https://github.com/gsemet/okf-schema) | 14 | MIT | Y | ~ | ~ | - | Y | ? | ? | ? | ? | ? | ? | Y | ? |
| [iwe-org/iwe](https://github.com/iwe-org/iwe) | 1,392 | Apache-2.0 | Y | ~ | Y | - | Y | ? | Y | ? | ? | ? | ~ | Y | ? |
| [Foam](https://github.com/foambubble/foam) | 17,344 | MIT (pkgs) | ~ | ~ | Y | - | Y | Y | Y | - | - | ~ | - | Y | - |
| [Logseq](https://github.com/logseq/logseq) | 44,421 | AGPL-3.0 | Y | ? | Y | Y | Y | ~ | Y | Y | ~ | ~ | ? | Y | ? |
| [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) | 14,956 | MIT | ~ | ? | ~ | - | **-** | ? | ~ | ? | ~ | ~ | ? | - | ? |
| [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) | 10,807 | MIT | - | Y | - | - | Y | ~ | - | Y | - | Y | - | Y | Y |
| [basic-memory](https://github.com/basicmachines-co/basic-memory) | 3,642 | AGPL-3.0 | Y | ? | Y | - | ~ | ? | Y | - | ? | ~ | ? | Y | Y |
| [Dendron](https://github.com/dendronhq/dendron) | 7,461 | Apache-2.0 | Y | ~ | ~ | ~ | Y | ~ | - | - | - | ~ | ? | Y | ? |
| [Quartz v4](https://github.com/jackyzha0/quartz) | 12,996 | MIT | - | ~ | ~ | - | Y | ~ | - | - | - | ~ | - | Y | - |

Dendron is **effectively dead** (README: "maintenace only, active development
has stopped"). Logseq's CLI targets a SQLite graph under `~/logseq/graphs` and
**cannot be pointed at a repository's `docs/`**, so its strong row does not
translate into competition for Lore's use case.

## Adjacent categories, condensed

Included because they set the ergonomic bar, not because they compete directly.

| Tool | Stars | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| [Backlog.md](https://github.com/MrLesk/Backlog.md) | 6,451 | ~ | ~ | ~ | **Y** | Y | ~ | Y | ~ | - | ~ | - | Y | - |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | 64,700 | Y | ~ | ~ | ~ | ~ | ~ | - | Y | ~ | ~ | ~ | Y | - |
| [github/spec-kit](https://github.com/github/spec-kit) | 126,484 | - | - | - | ~ | ~ | ~ | - | Y | - | ? | ? | ~ | - |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | 51,829 | - | ~ | - | - | ~ | - | - | Y | - | ? | ? | ~ | - |
| [claude-task-master](https://github.com/eyaltoledano/claude-task-master) | 27,992 | ~ | ~ | ~ | Y | ~ | ~ | Y | ~ | - | ~ | - | - | - |
| [Fern](https://github.com/fern-api/fern) | 3,753 | Y | Y | - | - | ~ | Y | Y | Y | ~ | ~ | ~ | ~ | Y |
| [Mintlify](https://mintlify.com) | n/a | ~ | Y | - | - | ~ | ~ | Y | Y | ? | ~ | ~ | ~ | Y |
| [Antora](https://github.com/antora/antora) | 595 | ? | ~ | ~ | ? | Y | Y | ? | ? | ~ | Y | - | Y | ? |
| [Sphinx](https://github.com/sphinx-doc/sphinx) | 7,974 | ~ | Y | ~ | - | Y | ~ | ? | ? | - | Y | - | Y | - |
| [Docusaurus](https://github.com/facebook/docusaurus) | 65,905 | ~ | **Y** | - | - | Y | ~ | - | - | ~ | ~ | - | Y | ~ |
| [Astro Starlight](https://github.com/withastro/starlight) | 9,054 | Y | ~ | - | ? | Y | ~ | - | ? | ? | ~ | - | Y | - |
| [mbeacom/adrkit](https://github.com/mbeacom/adrkit) | 6 | Y | Y | ~ | ~ | Y | ~ | Y | - | ~ | Y | Y | Y | - |
| [npryce/adr-tools](https://github.com/npryce/adr-tools) | 5,609 | - | - | ~ | - | Y | - | - | - | - | ~ | - | Y | - |
| [log4brains](https://github.com/thomvaill/log4brains) | 1,557 | ~ | - | ~ | - | Y | ~ | - | - | - | - | - | Y | - |
| [ast-grep](https://github.com/ast-grep/ast-grep) | 15,490 | ~ | - | - | - | Y | Y | Y | ~ | - | Y | ~ | Y | - |
| [Nx project graph](https://github.com/nrwl/nx) | 29,217 | ~ | ? | **Y** | - | Y | ~ | Y | ? | ~ | Y | ? | Y | - |
| [CodeQL](https://github.com/github/codeql) | 9,930 | Y | ? | Y | - | Y | Y | ~ | ? | - | Y | - | Y | - |
| [Graphiti](https://github.com/getzep/graphiti) | 29,866 | Y | ? | Y | - | **-** | ~ | Y | ? | **Y** | Y | ? | ~ | Y |
| [Mnemosyne](https://github.com/mnemosyne-oss/mnemosyne) | 2,444 | ? | ? | ~ | ? | Y | ? | Y | ? | ~ | ~ | ? | Y | Y |
| [Cline Memory Bank](https://docs.cline.bot/features/memory-bank) | n/a | - | - | - | ~ | - | - | - | - | - | - | - | ~ | - |

## Where Lore is genuinely alone

Only one claim survives skeptical reading as a true singleton.

**Task-tracker coupling with referential integrity in both directions.** Across
the whole surveyed field, column 4 is `Y` only where the tool *is* the tracker
(Backlog.md, task-master) or owns tasks inside its own graph (Logseq). **No OKF
tool has it** — verified by direct in-repo grep against `okf-ingest` and
`okf-rs`. spec-kit's `taskstoissues` is the nearest analogue and it is
LLM-driven, one-way, with no ID round-trip.

The coupled tracker has the exact hole this fills: Backlog.md accepts a
nonexistent `--doc docs/nope.md` **with exit 0**, so a task→doc edge is not
falsifiable on the tracker side. Lore's `doc:<conceptId>` label plus a `check`
gate over task↔doc edges is the only mechanism in this survey that makes that
edge checkable. *This is the differentiator to lead with.* One caveat that must
travel with it: the Backlog.md behaviour was probed at **1.49.3** while npm
latest was **1.50.1**. Re-verify before it goes on a marketing surface.

Two weaker claims, correctly labelled:

- **Attested Computation as an authorable typed concept.** OKF §10 defines it;
  only two surveyed tools touch it and both are read-side. Genuinely unique —
  but unique-and-unconsumed is not yet valuable, and Lore explicitly does not
  import, bind, evaluate, or attest computation assets.
- **Six-way differentiated exit codes** (0/2/3/4/5/6). The finest granularity
  observed — okfcli uses 0–4, Foam 0/1/2, Backlog.md and OpenSpec 0/1, and
  task-master is broken as a gate (exit 0 on error). Real but modest, and most
  tools' exit codes were never probed.

## Claims to stop making

**"Deterministic, no LLM in the core" is not a differentiator.** Nine surveyed
tools are deterministic; `okf-ingest` was verified byte-identical across three
runs. It is table stakes. Keep it as the *reason the tool can be trusted*, not
as the headline.

**"Generated SKILL.md agent bridge" is not a differentiator.** `okf-gem`
(`okf skill .claude`), zetl (`zetl skill init`, embedded in the binary so skill
and CLI version together), Logseq (`skill install`), ODS (`ods skill install`),
spec-kit (30+ agents), and BMAD all ship one.

**"Graph traversal, impact, snapshot" is a crowded club.** `okf-ingest`
(reverse-BFS transitive closure and exact Personalized PageRank over DuckDB),
`okf-rs` (callers/callees/cycles/BFS path/communities plus a 30-concept blast
radius), `iwe` (a real query language with `$includes`/`$referencedBy` and
`maxDistance`), ODS, zetl, and Foam all traverse.

## Where Lore is behind

| Gap | Who does it better | What they have that Lore does not |
|---|---|---|
| **Wall-clock-free checking** | claude-obsidian `lint --as-of` | See the defect below — this is a correctness bug, not a feature gap |
| **SARIF output** | okfcli, ODS | `--format sarif --exit-zero` puts findings in GitHub's Security tab |
| **Stable rule IDs** | okfcli (`okf/links/broken`), OpenSpec (~25 named codes) | CI can suppress and route by ID; message text can evolve safely |
| **CLI self-description** | okfcli `okf schema [command]` | An agent learns the whole surface in one call instead of N `--help` invocations |
| **Proof of determinism** | okf-rs `--check-determinism`; okf-ingest cross-language parity | Determinism as a *test*, not a sentence in a README |
| **Ranked, budgeted context** | okf-ingest `context --rank ppr`; ODS `context` + `bench` | Exact Personalized PageRank over the author-written link graph; reported token ROI |
| **Adoption ratchet** | scaccogatto `--max-warnings N`; okf-gem `--fail-on warn` | Turn the gate on today with 40 warnings and drive it down |
| **Legacy migration** | ODS `adopt`; scaccogatto `--migrate` | Lore has `init` and `new` — nothing for the 200 markdown files already in a repo |
| **Packaged CI surface** | scaccogatto composite Action; ODS Marketplace action | Works in repos with **no agent at all** — a distribution channel Lore lacks |
| **Write blast-radius guards** | iwe `expect` guards | A mutation declares how many documents it may touch; **mandatory over MCP** |
| **Reviewer-facing impact** | okf-rs `review <a> <b> --fail-on-risk` | Sticky PR comment plus a merge gate; Lore has `impact` but no reviewer renderer |
| **MCP server** | okf-gem, okf-mcp, okf-rs, iwe (14 tools), Foam (25), zetl (9), Backlog.md (20) | Deliberately deferred — but now the most common capability in the field |

### The one confirmed defect

`lore check` is **wall-clock dependent**, which contradicts the determinism
claim it is the gate for. `staleAfterFindings` in `src/core/check.ts` compares
an OKF 0.2 concept's `stale_after` against today's date and emits a
warning-tier `stale-after` finding; `--strict` promotes warnings to a failing
exit code.

Verified empirically against this repository's source, with a negative control,
on 2026-08-13 — a scratch 0.2 bundle carrying `stale_after: 2020-01-01`:

```text
warning reference/stale-probe.md [stale-after]: content is stale:
  stale_after 2020-01-01 has elapsed as of 2026-08-13
2 files, 0 errors, 1 warning
lore check          -> exit 0
lore check --strict -> exit 6
```

The same commit, unchanged, passes before that date and fails after it. The
currently published `0.1.1` binary does not reproduce this because it does not
implement OKF 0.2 staleness semantics, so the exposure arrives with the next
release rather than existing in the field today. The fix is `--as-of` — see
[the adoption roadmap](../specs/lore-competitive-adoption-roadmap.md).

### A second, smaller finding: `check` does not follow links out of the bundle

Established by negative control on 2026-08-13 while verifying this page's own
citations. An in-bundle broken link fails correctly and names both files:

```text
error reference/lore-competitive-feature-matrix.md [broken-link]: link
  "claude-obsidian-teardown-NOPE.md" points at
  "reference/claude-obsidian-teardown-NOPE.md", which is not in the bundle
69 files, 1 error, 0 warnings   -> exit 6
```

A link from a concept to a repository path **outside** `docs/` does not.
Pointing this page's citation at a nonexistent `research/.../NOPE.md` left the
run at `69 files, 0 errors, 0 warnings`, exit 0. That is defensible scope —
`check` gates the bundle — but it means the out-of-bundle links on
[the landscape page](competitive-landscape-agent-native-knowledge-tooling.md)
are **not** covered by the gate and were verified by hand instead. Worth either
extending the gate to repository-relative targets or saying plainly in
[the CLI contract](cli-contract.md) that it stops at the bundle edge, so nobody
reads a green `check` as a guarantee it never made.

### One gap Lore does not actually have

Pass 2 reported that Lore "does not declare" its divergence from OKF's
permissive conformance floor. **That is wrong**, and it is wrong because the
research was given a description of Lore rather than the repository.
[OKF conformance](okf-conformance.md) already separates the three contracts,
audits every 0.2 field family, and states that an exit 6 from a Lore-specific
gate does not by itself mean the input is non-conformant OKF. What is genuinely
missing is only the *machine-readable* form — a `lore conformance --json`
command. Recorded here because an uncorrected external finding becomes a
phantom defect that someone later "fixes" twice.

## Cells this matrix cannot fill

- `okfcli/okf` and `zetl` — the two tools most threatening to Lore's
  differentiation — were **never verified against a shipped artifact**. If
  either has an authoring lifecycle or task coupling that was missed, the
  "unique intersection" claim weakens.
- `openknowledge-sh/okn` has 9 of 13 cells unknown despite the broadest
  command surface in the OKF ecosystem. It is the largest single unknown.
- Tessl is uninspectable by construction — its npm package is a 17 KB
  installer stub for a proprietary binary. Every Tessl cell is permanently
  unknown.
- No head-to-head context-quality benchmark exists. ODS's "~95% saving" is
  self-reported by ODS's own `bench` command.
- Stars measure repository popularity, not format adoption. Nothing here
  measures how many OKF bundles exist in the wild.
