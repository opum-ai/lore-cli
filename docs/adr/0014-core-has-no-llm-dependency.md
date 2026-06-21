---
type: ADR
title: "ADR-0014: Core lore has no LLM dependency"
description: >-
  Every core lore operation is deterministic and makes no LLM or network-model
  call. lore is the bookkeeper and verifier of a documentation bundle, not an
  author of prose; any future LLM-backed helper is a separate, explicit,
  opt-in surface that core never depends on.
tags: [architecture, determinism, llm, security, ci, reproducibility, core]
summary: lore's core is fully deterministic with zero LLM dependency; it bookkeeps and verifies docs rather than authoring them, and any model-backed helper is a separate opt-in.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0014: Core lore has no LLM dependency

## Status

Accepted — 2026-06-21.

This decision is foundational to lore's positioning and is referenced by the
CLI-first transport decision, which relies on the core being a deterministic
library that any surface can wrap. See
[ADR-0004: CLI-first; Core; SKILL.md bridge; MCP deferred](0004-cli-first-skill-bridge-mcp-deferred.md),
[ADR-0001: Runtime, build, distribution](0001-runtime-build-distribution.md),
and [ADR-0003: OKF as the documentation substrate](0003-okf-substrate.md).

## Context

lore sits in a crowded, fast-moving space of "AI documentation" tooling. Most of
that tooling treats a large language model as the engine: it drafts, rewrites,
and summarizes prose on the user's behalf. lore deliberately does the opposite.
Several forces push core toward strict determinism with no model in the loop.

- **LLM-written docs decay fastest.** The dominant community signal in 2026 is
  that machine-generated documentation rots quickly — the "everyone writing,
  nobody reading" problem. When a model can emit pages cheaply, volume outruns
  human review; the docs drift from the code, nobody trusts them, and the bundle
  becomes noise. lore's value proposition is the inverse: a *small, true,
  cross-linked* bundle that is mechanically kept coherent with
  [Backlog.md](../reference/backlog-cli-contract.md) tasks and with itself. That
  proposition collapses if the core is itself a prose generator.

- **Reproducibility and CI-safety.** lore commands run in CI, in
  agent loops, and on developer machines, and they are expected to be
  idempotent: the same inputs must produce byte-identical output so diffs stay
  clean and gate checks are stable (see [ADR-0001](0001-runtime-build-distribution.md)
  for the agent/CI-safe execution model, and the drift gate in
  [`lore check`](../reference/cli-surface.md)). A network model call is
  non-deterministic by construction — outputs vary run to run, depend on a
  remote service's availability and version, and cannot be reproduced offline.
  Putting one in the core path would make `validate`, `check`, `sync`, `query`,
  `context`, `graph`, and the refactoring commands flaky and unauditable.

- **Offline and air-gapped operation.** A documentation/verification tool must
  work with no network, no API key, and no account. Any core dependency on a
  hosted model would break offline use, add latency and cost to every run, and
  introduce an external failure mode for operations that are otherwise pure
  local file and graph computation.

- **Indirect prompt-injection surface.** lore reads untrusted bundle content —
  arbitrary markdown bodies and frontmatter, including unknown OKF types and
  pass-through keys (OKF tolerance, see [ADR-0003](0003-okf-substrate.md)). If
  core fed that content into an LLM to make decisions, a crafted document could
  steer the tool: rewrite links, suppress validation errors, alter task
  coupling, or exfiltrate context. Keeping the core a deterministic parser and
  graph-walker means bundle content is *data*, never *instructions*. There is no
  model whose behavior the content can hijack.

- **Trust boundary with the agent.** lore is invoked *by* coding agents (Claude
  Code via the generated SKILL.md, per [ADR-0004](0004-cli-first-skill-bridge-mcp-deferred.md)).
  The agent is where the LLM lives. lore's job is to give that agent
  deterministic, structured, verifiable ground truth (`--json` contract,
  semantic exit codes), not to add a *second*, hidden model whose output the
  agent would then have to reconcile. The division of labor is clean: the agent
  authors; lore records and checks.

## Decision

1. **All core lore operations are deterministic and contain no LLM or
   network-model calls.** This applies to the entire core library and every
   command built on it — `init`, `new`, `validate`, `check`, `sync`, `link` /
   `unlink`, `tasks` / `orphans`, `graph`, `context`, `query`, `replace`,
   `rename`, `supersede`, `scaffold`, and `instructions`. Given the same bundle,
   the same Backlog.md JSON, and the same flags, each produces identical output.
   The only external process core invokes is the `backlog` binary over its
   JSON-emitting CLI (see [ADR-0005 / Backlog coupling] in
   [backlog-cli-contract.md](../reference/backlog-cli-contract.md)), which is
   itself deterministic local computation, not a model.

2. **lore is the bookkeeper and verifier, not an author of prose.** Core never
   writes natural-language *content*. It writes *structure and metadata* that it
   can later verify: frontmatter scaffolds from templates, managed regions
   (e.g. the `<!-- lore:tasks -->` block) regenerated from task data, status
   reconciliation, index/log generation, and link rewrites driven by the bundle
   graph. Every byte lore emits is reproducible from declared inputs and can be
   re-derived and checked on the next run. Where prose belongs to a human or an
   agent — the body of a Story, the narrative of an ADR — lore scaffolds the
   skeleton and leaves the writing to its caller.

3. **Retrieval and context export are deterministic, not generative.**
   `lore query` is in-memory full-text ranking (BM25-style) with frontmatter
   filters — no vectors, embeddings, RAG, or chunking. `lore context <id>` is a
   depth-bounded, graph-expansion export under a `--max-tokens` budget that
   emits the concept body plus one-line neighbor `summary` fields verbatim from
   frontmatter — no ranking heuristics and no model-written synthesis. Token
   figures are labeled *estimates* from a fixed `chars/4` heuristic, never a
   tokenizer API call. These are search and packaging, not generation.

4. **Any future LLM-backed helper is a separate, explicit, opt-in surface that
   core does not depend on.** Plausible candidates — drafting a `summary` field,
   proposing a description, suggesting cross-links, smoothing prose — are
   legitimate *conveniences*, but they are not core. If built, such a helper:
   - lives outside the core library as an isolated module (the same boundary
     pattern used for the deferred [Confluence adapter](../specs/lore-design.md)),
     so core never imports it and has zero model dependency;
   - is invoked only by an explicit command or flag a human/agent chooses to run
     (e.g. a hypothetical `lore suggest --summary`), never implicitly inside a
     deterministic command;
   - produces a *proposal a human or agent accepts*, which then becomes ordinary
     authored content that lore's deterministic core records and verifies — the
     model's output re-enters the system as data, subject to the same
     [validation](../reference/cli-surface.md) as any other prose;
   - requires its own credentials/network and degrades to a no-op when absent,
     so it can never break offline or CI runs.

## Consequences

### Positive

- **Reproducible, auditable runs.** Identical inputs yield identical outputs, so
  diffs are clean, `lore check` is a stable gate, and agent loops are safe to
  run repeatedly without churn.
- **Offline-, air-gap-, and CI-friendly.** No API key, account, network, or
  per-run model cost. lore works on a plane, in a locked-down build runner, and
  in a private monorepo with equal fidelity.
- **No indirect prompt-injection path through bundle content.** Because core
  never feeds document text to a model to make decisions, a malicious or
  accident-prone document cannot steer the tool. Content is data, full stop.
- **A durable, honest product position.** lore competes on *coherence and
  truth*, not on prose volume — the opposite of the tools whose output decays
  fastest. The core's guarantee ("everything lore wrote, lore can re-derive and
  verify") is only possible because nothing in core is generative.
- **Clean transport story.** A deterministic core is exactly what makes the
  CLI-first / one-implementation-many-transports decision
  ([ADR-0004](0004-cli-first-skill-bridge-mcp-deferred.md)) sound: any
  surface — CLI today, MCP tomorrow — is a thin shell over functions with no
  hidden nondeterminism.
- **Fast and cheap.** Pure local computation means low latency and no
  per-invocation token spend, which matters when commands run on every commit
  and inside tight agent loops.

### Negative / tradeoffs

- **lore writes no prose for you.** Users expecting "AI that documents my code"
  will find lore scaffolds and verifies but does not author. We accept this
  deliberately; the authoring agent (Claude Code) already exists at the layer
  above, and lore's job is to keep what it produces honest.
- **Retrieval is lexical, not semantic.** `lore query` will miss synonyms and
  conceptual matches that an embedding search would catch. We accept this for
  determinism, offline operation, and zero infrastructure; the bundle's
  `summary` fields and cross-link graph carry much of the semantic load instead.
- **Helpers are extra work to build later.** Keeping LLM features out of core
  means a future `summary`-drafting helper is a separate, gated module rather
  than a quick inline call. This is the intended cost of the isolation boundary.
- **No "magic" first impression.** A deterministic verifier is less flashy in a
  demo than a tool that spews generated pages. The payoff is that lore's output
  is still trustworthy on day 90, which is the whole point.

## Alternatives considered

- **LLM in the core path (generative-first tool).** Rejected. It would make
  `validate` / `check` / `sync` non-reproducible, break offline and CI use, add
  cost and latency to every run, and open an indirect prompt-injection surface
  through bundle content. It would also put lore on the wrong side of the
  "LLM-written docs decay fastest" signal — generating exactly the noise the
  tool exists to prevent.

- **LLM-assisted retrieval (embeddings / RAG / vector index) in core.** Rejected
  for `query` and `context`. Embeddings introduce a model dependency, an index
  to build and keep fresh, nondeterministic ranking, and (for hosted embeddings)
  a network call — all for a tool whose corpus is a small, hand-curated bundle
  where deterministic BM25 plus the cross-link graph and `summary` fields are
  sufficient. Revisit only if bundle scale ever makes lexical search inadequate,
  and then as an explicit opt-in module, not a core dependency.

- **Optional LLM features behind a config flag, but living *inside* core.**
  Rejected. Even gated, an in-core integration drags the model SDK, credentials
  handling, and a network failure mode into the core dependency tree, and risks
  a code path where a "deterministic" command quietly calls a model. Isolation
  as a separate module is the only boundary that actually preserves the
  guarantee.

- **No determinism guarantee at all (let implementations choose).** Rejected.
  Without an architectural rule, model calls would inevitably creep into
  convenience features and erode the reproducibility, CI-safety, and
  injection-resistance that the whole design — from the
  [`--json` contract](../reference/cli-contract.md) to the drift gate — depends
  on. The guarantee has to be a stated invariant, not an aspiration.
