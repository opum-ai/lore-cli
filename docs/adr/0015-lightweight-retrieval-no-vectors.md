---
type: ADR
title: "ADR-0015: Lightweight retrieval: full-text + graph context, no vectors"
description: Why lore's retrieval surface is in-memory BM25-style full-text search plus frontmatter filtering (`lore query`) and a deterministic, depth-bounded, token-budgeted graph export (`lore context`), with no vector database, embeddings, RAG, or chunking subsystem.
tags:
  - adr
  - retrieval
  - query
  - context
  - search
  - graph
  - no-rag
  - no-vectors
  - agent
summary: lore combines in-memory full-text search, frontmatter filters, and deterministic graph expansion without a vector stack.
timestamp: 2026-06-21T00:00:00Z
status: superseded
superseded_by: adr/0018-persistent-local-graph-projection-with-ladybugdb
---

# ADR-0015: Lightweight retrieval: full-text + graph context, no vectors

## Status

Accepted — 2026-06-21

Superseded for persistence and indexed routing by
[ADR-0018](0018-persistent-local-graph-projection-with-ladybugdb.md). Its
deterministic lexical and no-vector boundary remains active. LCLI-289 extends
that boundary with Markdown-section selection inside an explicit agent-profile
allowlist. This is AST-based evidence packing, not an embedding system,
semantic reranker, overlap chunk store, or model-backed RAG pipeline.

## Context

lore must let agents and humans *find* and *assemble* the right documentation
without leaving the repo. Two distinct needs:

1. **Find** — "which concepts mention order archival / are tagged `retention` /
   are `type: Story`?" This is a ranked-lookup problem.
2. **Assemble** — "give me everything an agent needs to reason about
   `stories/bulk-archive-orders` within a token budget." This is a bounded
   context-construction problem.

The naive 2023-era answer to both is a vector store: embed every chunk, do
approximate-nearest-neighbour search, stuff the top-k into a prompt (RAG). lore
deliberately rejects that for its core, for reasons grounded in both the product
philosophy and the 2026 state of practice:

- **The typed graph IS the curation layer.** lore docs already carry a required
  `type`, a one-sentence `summary`, `tags`, and explicit cross-links forming a
  graph (see [ADR-0003: OKF as the documentation substrate](0003-okf-substrate.md)
  and [okf-conformance](../reference/okf-conformance.md)). That structure is
  human-curated relevance. The 2026 consensus is that **curated, structured
  context beats naive RAG**: retrieval quality is dominated by how well the
  corpus is organized, not by embedding sophistication, and naive chunk-overlap
  windows have shown no measurable benefit while adding cost and fragility. A
  vector index would re-derive, lossily and probabilistically, structure the
  bundle already states explicitly.

- **Determinism is a core constraint.** lore's core is specified to be
  deterministic with **no LLM dependency** (see
  [ADR-0004: CLI-first; reusable Core; MCP deferred](0004-cli-first-skill-bridge-mcp-deferred.md)).
  Embeddings require a model (local or hosted), introduce non-reproducible
  results across model versions, and would make `query`/`context` output
  drift between runs — poison for agent loops and CI snapshots.

- **Zero-config / `bunx`-friendly is non-negotiable.** A vector store means an
  ANN library, an index file to build and invalidate, or a network service plus
  an embedding model on the hot path. That contradicts the thin, single-binary,
  install-and-go shape established in
  [ADR-0001: Runtime, build & distribution](0001-runtime-build-distribution.md).
  See [tech-stack](../reference/tech-stack.md).

- **The bundle is small and in-memory.** A repo's `docs/` tree is bounded —
  tens to low-thousands of concept files, not a web corpus. The whole bundle
  graph is already walked and held in memory for `validate`, `check`, `graph`,
  and managed-block surgery. An in-process inverted index over that same data
  is fast enough that an external index would be pure overhead.

- **Rendered consumers ship their own search.** When the bundle is published to
  MkDocs, Docusaurus, or opened in Obsidian (see
  [consumer-compatibility](../reference/consumer-compatibility.md)), each
  provides its own full-text/UI search. lore does not need to be the search UI
  for humans browsing rendered docs; it needs to serve the **CLI/agent** path.

- **Token accounting must be cheap.** lore surfaces per-doc/bundle token
  *estimates* using a `chars/4` heuristic (explicitly labeled an estimate),
  deliberately avoiding a heavy tokenizer in the core. Retrieval budgeting must
  build on that same cheap heuristic, not a model-specific tokenizer.

## Decision

lore's retrieval surface is two deterministic, in-process commands. **No vector
database, no embeddings, no RAG pipeline, no chunking subsystem.**

### `lore query` — in-memory full-text + frontmatter filters

`lore query <terms…>` builds an **in-memory inverted index** over the parsed
bundle (titles, `summary`, body text, and selected frontmatter) and ranks
matches with a **BM25-style** scoring function. It runs on the bundle graph
already loaded in memory; there is no persisted index to build, stale, or
invalidate.

- **Field filters** narrow before/after scoring: `--type story`, `--tag
  retention`, `--status in-progress`, and arbitrary frontmatter equality
  filters. Filters are exact, deterministic predicates over the typed
  frontmatter — the Zod-validated source of truth (see
  [ADR-0006: Schema, types & templates](0006-schema-types-templates.md)).
- **Snippets** come from each concept's one-sentence `summary` (preferred) or a
  match-window of the body, so results are scannable without opening files.
- **Output** honors the global modes — `--json > --plain > pretty` — per the
  [CLI contract](../reference/cli-contract.md), with `--json` returning the
  standard `{schemaVersion, kind, data}` envelope so agents consume results
  structurally. Read-heavy result sets are **bounded with truncation hints**
  (e.g. "showing 30 of 120 — narrow with `--type story`").
- BM25 ranking is a fixed, parameterized formula over term frequencies and
  document lengths: **deterministic**, identical across runs, no model.

### `lore context <id>` — deterministic, budgeted graph export

`lore context <id>` assembles a single payload for an agent to reason about a
concept, built **entirely from the existing typed graph and cross-links** — no
similarity search, no ranking heuristics:

- **Seed**: the target concept's full body and frontmatter.
- **Neighborhood**: a **depth-bounded graph expansion** (`--depth`, default
  shallow) over the *actual* cross-links and frontmatter refs (`tasks`, `specs`,
  `supersedes`/`superseded_by`, etc.) — the same graph used by `lore graph`.
  Neighbors are included as their **one-line `summary`**, not their full bodies,
  giving breadth without blowing the budget.
- **Token budget**: `--max-tokens` caps the payload using the `chars/4`
  estimate. The seed body is included whole; neighbor summaries are added in a
  **stable graph order** (depth, then link order) until the budget is reached,
  then truncated with an explicit "showing N of M neighbors" hint. Inclusion is
  a deterministic traversal-and-fill, **not** a relevance ranking — given the
  same bundle, the same id, and the same budget, the output is byte-identical.
- This is "context compaction by structure": the curation that decides what is
  relevant is the author-written graph, executed deterministically, rather than
  cosine similarity over opaque vectors.

### Scope boundary (what is explicitly out)

- **No vector DB** (no sqlite-vss, LanceDB, Qdrant, pgvector, etc.).
- **No embeddings / no embedding model** on any path in the core.
- **No RAG orchestration** and **no chunking/overlap subsystem** — concepts are
  the unit of retrieval; the file *is* the chunk.
- **No semantic re-ranking** in `context`; neighbor selection is graph
  traversal under a budget, full stop.

If a team wants semantic search, they layer it *on top* of the bundle (or use a
rendered consumer's search) — it never becomes a runtime dependency of lore.

## Consequences

### Positive

- **Deterministic and reproducible.** Both commands are pure functions of the
  on-disk bundle. Agent loops and CI snapshots get byte-stable results; no model
  version can shift relevance under you.
- **Zero-config and instant.** No index to build, embed, persist, or
  invalidate; `bunx @opum-ai/lore query …` works with nothing installed,
  consistent with the thin single-binary distribution.
- **Curation-honest.** Relevance is the author-written `type`/`tags`/`summary`/
  links — visible, editable, and reviewable in the repo — instead of opaque
  vectors. Improving retrieval means improving the docs, which is the desired
  incentive.
- **Reuses one graph.** `query`, `context`, `graph`, and `check` all run on the
  single in-memory bundle graph and the shared remark/mdast pipeline
  (see [ADR-0008: Managed task block via remark/mdast AST](0008-managed-block-remark-ast.md)),
  so "what is a link", "what is a neighbor", and "what is a summary" mean the
  same thing everywhere.
- **Bounded, agent-safe output.** `--max-tokens` budgeting and truncation hints
  keep payloads inside context windows and steer the caller toward narrower
  queries.

### Negative / tradeoffs

- **No semantic recall.** A query for "deprecate" will not surface a doc that
  only says "sunset" unless they share a token or a tag. We accept this:
  synonym/semantic gaps are mitigated by good `tags`/`summary` authoring and by
  the explicit graph, and a deterministic-but-literal search is judged more
  trustworthy for agents than a probabilistic one.
- **Quality depends on curation.** Retrieval is only as good as the bundle's
  types, summaries, and links. This is intentional — it shifts effort from a
  model to the docs — but it does mean a poorly-linked, summary-less bundle
  retrieves poorly. `lore validate` warns on missing/over-long `summary` to push
  back on this (see [ADR-0007: Validation & coherence checking](0007-validation-and-coherence.md)).
- **`context` is breadth-first by structure, not relevance.** A weakly-linked
  but highly-relevant concept will not appear in `context` output; only the
  authored neighborhood does. The fix is to add the missing cross-link, which is
  again the desired incentive.
- **Token budgeting is approximate.** The `chars/4` estimate can under- or
  over-count for a specific model's tokenizer, so `--max-tokens` is a guardrail,
  not a guarantee — it is labeled an estimate wherever surfaced.

## Alternatives considered

- **Embed-everything vector store + RAG.** Rejected: pulls in an embedding
  model and an ANN index, breaks determinism and zero-config, and re-derives
  (lossily) the structure the bundle already states. The 2026 evidence that
  curated context beats naive RAG removes the upside.
- **Chunking with overlapping windows.** Rejected: adds a chunk store and tuning
  knobs for no measured benefit; concepts (whole files) are already the natural,
  human-authored retrieval unit.
- **Persisted on-disk full-text index (e.g. a committed Lunr/FlexSearch index,
  or SQLite FTS5).** Rejected for the core: a persisted index is a second source
  of truth that drifts from `docs/` and must be rebuilt and committed. The
  bundle is small enough to index in memory on every invocation, keeping the
  repo the sole source of truth. (A consumer's rendered-site search index is a
  separate, regenerated artifact and is fine.)
- **Relevance/semantic ranking inside `lore context`.** Rejected: any ranking
  heuristic reintroduces non-determinism and a "why did it pick that?" black
  box. Graph traversal under a token budget keeps `context` explainable and
  reproducible.
- **Calling out to an external embedding/RAG service.** Rejected for the core:
  adds a network dependency, latency, cost, and non-reproducibility to a tool
  whose whole premise is a thin, offline, deterministic CLI. Teams may build
  this externally on top of the bundle.

---

See also: [lore-design](../specs/lore-design.md),
[cli-surface](../reference/cli-surface.md),
[cli-contract](../reference/cli-contract.md),
[okf-conformance](../reference/okf-conformance.md),
[consumer-compatibility](../reference/consumer-compatibility.md),
and the [ADR log](index.md).
