---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: claude-obsidian teardown
description: >-
  A primary-source teardown of AgriciDaniel/claude-obsidian v2.1.0 — the
  highest-profile agent-native knowledge system adjacent to Lore — read from a
  local clone rather than from its README alone. Records its distribution model
  (Claude Code plugin plus 15 Agent Skills, not an MCP server), its two-ledger
  source/claim evidence schema, its plan/approve/apply transaction contract,
  its lint finding codes, its BM25-plus-optional-rerank retrieval pipeline, its
  machine-readable capability-honesty manifest, and its reproducible release
  engineering — with the evidence path for each claim.
tags:
  - competitive
  - claude-obsidian
  - teardown
  - obsidian
  - agent-skills
  - provenance
summary: >-
  An Agent Skills plugin over a 39.6k-line Python core, distinguished by a
  source/claim ledger pair, hash-approved transactional writes, and declared
  capability boundaries.
timestamp: 2026-08-13T02:03:19.858Z
---

# claude-obsidian teardown

This page records what
[`AgriciDaniel/claude-obsidian`](https://github.com/AgriciDaniel/claude-obsidian)
is, at the level of detail needed to compare it with Lore rather than to
summarize its marketing. It is the reference teardown behind
[the competitive feature matrix](lore-competitive-feature-matrix.md); the wider
field survey is in
[the competitive landscape](competitive-landscape-agent-native-knowledge-tooling.md).

**Method and its limits.** Every claim below was read from a `--depth 50`
clone at `HEAD 1c1bc49`, tag `v2.1.0`, on **2026-08-12**, or from
`gh api` against the live repository on that date. Where a claim comes from
prose rather than code, this page says so. Repository facts move: treat every
number here as a **then-current observation on 2026-08-12**, and re-read the
upstream repository before relying on one. This teardown is a cache, and on
disagreement the upstream repository is authoritative and this page is the
defect.

## What it is, in one paragraph

claude-obsidian is a **local-first knowledge system distributed as a Claude
Code plugin**: 15 Agent Skills, 3 subagents, and a `SessionStart`/`Stop` hook
pair, sitting on top of a 39,642-line Python core that owns vault mutation.
It turns source material into linked, source-cited Obsidian pages and answers
questions from evidence already in the vault. The user's vault stays an
ordinary directory of Markdown, JSON, and source files, deliberately separate
from the product checkout. Its stated lineage is
[Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
plus [`kepano/obsidian-skills`](https://github.com/kepano/obsidian-skills) as
the substrate for Obsidian Flavored Markdown, Bases, and JSON Canvas.

Then-current repository facts (`gh api`, 2026-08-12): **10,807 stars**, 1,251
forks, **MIT**, Python, created 2026-04-07, last push 2026-08-01, not archived.

## Distribution: a plugin and skills, explicitly not an MCP server

This is the single most important structural fact for Lore, because it is
independent corroboration of
[ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md).

- The product ships `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`, 15 `skills/<name>/SKILL.md` files
  (1,721 lines total), 3 subagents (`agents/verifier.md`,
  `agents/wiki-ingest.md`, `agents/wiki-lint.md`), and `hooks/hooks.json`
  binding `SessionStart` and `Stop` to a 5-second Python hook.
- **MCP is an optional third-party adapter, never a prerequisite**
  (`skills/wiki/references/mcp-setup.md`). The Obsidian Local REST API
  adapter is read/search-only and off by default
  (`skills/wiki/references/rest-api.md`).
- It is portable across agent hosts by shipping each host's native
  instruction file rather than one protocol: `AGENTS.md`, `GEMINI.md`,
  `.cursor/rules/`, `.windsurf/rules/`, `.github/copilot-instructions.md`,
  and `bin/setup-multi-agent.sh --host codex`.

A 10.8k-star project in exactly this space reached the same conclusion Lore
did — skills and a CLI beat an always-on MCP server — and went further by
treating *each host's own convention* as the portability layer.

## The core

`claude_obsidian/` is 18,762 lines; the whole repository is 39,642 lines of
Python. Module sizes are a fair proxy for where the engineering went:

| Module | Lines | Concern |
|---|---:|---|
| `transaction.py` | 4,680 | Plan/approve/apply, locking, journaling, recovery |
| `release.py` | 2,591 | Reproducible build and artifact audit |
| `capture.py` | 2,231 | Content-addressed source capture |
| `checkpoint.py` | 1,366 | Explicit git checkpoints |
| `contracts.py` | 1,365 | Capability verification |
| `ledgers.py` | 1,351 | Source and claim evidence model |
| `lint_engine.py` | 1,279 | Vault health findings |
| `cli.py` | 1,274 | Command surface |

More than a quarter of the core is the write path. That is the shape of a
project that decided correctness-under-concurrency was the product.

## The evidence model: two ledgers, not one

Read from `claude_obsidian/ledgers.py` and
`skills/wiki/references/provenance.md`. Three artifacts are kept deliberately
separate, and the contract says in as many words: *do not overload one ledger
with all three jobs.*

| Artifact | Schema id | Job |
|---|---|---|
| `.raw/.manifest.json` | legacy-compatible | Ingestion hashes, generated pages, address map |
| `wiki/meta/ledgers/source-ledger.json` | `claude-obsidian.source-ledger.v1` | Source identity, authority, freshness, review state |
| `wiki/meta/ledgers/claim-ledger.json` | `claude-obsidian.claim-ledger.v1` | Falsifiable claims, support, contradiction, confidence, risk |

The enumerations are closed sets in code, not prose suggestions:

- `AUTHORITIES` — `official`, `primary`, `secondary`, `community`,
  `synthetic`, `unknown`
- `SOURCE_STATUSES` — `unreviewed`, `active`, `superseded`, `rejected`
- `CLAIM_ASSESSMENTS` — `accepted`, `provisional`, `contested`,
  `unsupported`, `deprecated`
- `CONFIDENCES` — `high`, `medium`, `low`, `unknown`
- `EVIDENCE_RELATIONS` — `supports`, `contradicts`, `context`
- `CLAIM_RISKS` — `normal`, `high`

The rules layered on top are what make it more than a schema:

- An `accepted` claim needs at least one **fresh, active, non-synthetic**
  source. A **high-risk** accepted claim needs **two independent** sources.
- Independence is enforced, not assumed. Sources sharing an
  `independence_key` do not corroborate each other, and `ledgers.py`
  canonicalizes URLs — IPv6, IDN, Unicode, dot-segments, default ports,
  percent-encoding — so that two spellings of one origin cannot masquerade as
  two sources. Escaped reserved path and query bytes stay distinct, because
  they can genuinely identify a different resource.
- **Contradictory evidence is preserved.** The contract forbids silently
  selecting a winner. `unsupported` is the canonical no-data state, and a
  grounded refusal is explicitly preferred to an invented citation.
- Staleness derives from `refresh_due` alone — no second, driftable stale
  flag.

**Why this matters to Lore.** Lore's producer profile already targets OKF 0.2,
so it already *recognizes* `sources[]`, `generated`, `verified`, `status`, and
`stale_after` (see [OKF conformance](okf-conformance.md)). What claude-obsidian
adds on top of a comparable frontmatter vocabulary is an **enforcement
engine**: corroboration arithmetic, an independence check, and a refusal to
resolve contradictions automatically.

## The write model: nothing mutates without an approved hash

From `README.md` and `skills/wiki/references/operation-transactions.md`,
implemented in `transaction.py`.

Every mutating command is two-phase. The first run emits a JSON plan
containing `approved_plan_sha256`; the operation only applies when re-invoked
with `--approved-plan-sha256 <hash> --apply`. The hash **binds to the
canonical resolved vault root**, so an approval cannot be replayed against a
different vault. Determinism inputs are pinned explicitly by the caller:
`--generated-at`, `--operation-id`, and `lint --as-of YYYY-MM-DD`.

One logical operation is one `claude-obsidian.transaction.v1` bundle and one
recoverable apply:

1. Read every target and record its expected SHA-256 — or `null` when it must
   be absent.
2. Parallel workers return **drafts and evidence only**; they never touch
   shared vault state.
3. The orchestrator merges one bundle, runs `transaction inspect`, then
   applies once.
4. A changed target is a **conflict, never a silent overwrite**.
5. A process-lifetime vault lock, journaled backups, and atomic replacement
   back it; `transaction recover` restores an interrupted operation.

Git history is never implicit: `checkpoint` is a separate, explicit command,
and the contract forbids committing from a generic lifecycle hook.

## Lint: the health surface

Finding codes read verbatim from `lint_engine.py`: `dead_links`,
`dangling_links`, `allowlisted_dangling_links`, `stale_index_entries`,
`missing_frontmatter`, `missing_fields`, `empty_sections`,
`duplicate_basenames`, `ambiguous_targets`, `provenance_errors`,
`read_errors`, `configuration_errors`. Reports carry `pages_scanned`,
`links_scanned`, `issues_found`, `category_counts`, `engine_version`, and
`as_of`. Dangling links can be allowlisted at
`.vault-meta/lint-allowlist.json`.

`--as-of` deserves attention: it makes a time-dependent report **deterministic
for a declared UTC date**, which is how you keep a freshness-aware linter
reproducible in CI. Lore has no equivalent because Lore has no time-dependent
finding — but it would need one the moment it adopts `stale_after`.

## Retrieval: deterministic floor, optional ceiling

From `skills/wiki-retrieve/SKILL.md` and `scripts/`.

The pipeline is `contextual-prefix.py` (1,007 lines — paragraph-boundary
chunking plus a short page-level prefix) → `bm25-index.py` (851 lines,
standard-library BM25) → `retrieve.py` → `rerank.py` (optional cosine).
The default reranker is Ollama's multilingual `nomic-embed-text-v2-moe`
(~958 MB), which **the product never pulls automatically**.

The engineering discipline is the interesting part, not the embeddings:

- **Total, deterministic fallback.** Any embedding failure reverts the *whole*
  result set to BM25 order. It never mixes cosine and BM25 score scales.
- **Incremental with an anti-staleness interlock.** Prefixing skips records
  whose chunk and page hashes still match; a full scan removes surplus
  records; and the prefixer **invalidates the BM25 index before changing its
  chunk set**, so a mixed stale index is never served.
- **Derived state is quarantined.** Caches live under `.vault-meta/` and are
  disposable; canonical notes are never touched by retrieval.
- **Egress is consented, never inferred.** `--allow-egress` and
  `--allow-remote-ollama` are required, and the contract states that consent
  must never be inferred from a present API key or an installed binary.
- A missing or corrupt index exits `10` with a stable rebuild command rather
  than returning a plausible empty result.

## Capability honesty as a machine-readable artifact

`config/capabilities.json` gives every capability a declared `tier`,
`implementation_paths`, `read_scope`, `write_scope` (each pattern carrying
`access: create_only | transactional`), `needs.shell` / `needs.network`,
`transaction_type`, a `confirmation` block
(`mutation`, `network_egress`, `destructive`) — and, notably, both a
`verification_command` **and** a `verification_reason`. The autoresearch
capability ships an empty verification command with the reason
"no automated end-to-end behavioral verifier is implemented", which is a
machine-readable admission of an untested path. `contracts --verify` executes
these.

The README carries the human-facing counterpart, an *Honest capability
boundaries* table stating that PDF and EPUB get metadata, hash, and size but
**no built-in semantic extraction**, and that URL, YouTube, and OCR need a
configured external runner.

This is the practice
[Lore's own authoring rules](../../CLAUDE.md) argue for — a gate that
enumerates and a claim that names its own limits — expressed as config rather
than prose.

## Release and platform posture

`release build` is byte-reproducible and self-auditing; `release audit`
inspects the zip without extracting it. `SHA256SUMS`,
`RELEASE_MANIFEST.json`, and `config/release-allowlist.json` back it.
Artifacts reject contributor vault state, root raw sources, private paths,
recognizable personal email addresses, secrets, symlinks, unsafe archive
entries, and unreviewed binaries. **No command pushes, tags, publishes, or
creates releases automatically.**

CI runs a Linux and macOS matrix plus a native-Windows smoke job. On native
Windows, read-only inspection and dry runs work, but vault writes require WSL
and **fail closed** with `UNSUPPORTED_PLATFORM`. Approval hashes bind to the
reviewing environment, so review must happen where the apply will happen.

## Filing methodologies

`wiki-mode` routes new notes by one of four conventions — Generic (default),
LYT, PARA, Zettelkasten — and changing mode affects **new notes only**; it
never bulk-reorganizes existing knowledge. Lore's typed concepts (ADR, Epic,
Reference, Runbook, Spec, Story, Attested Computation) are a different and
stricter answer to the same filing question: a closed, validated type system
rather than a selectable folk methodology.

## Where it is weak, relative to Lore

Stated as gaps in claude-obsidian, each verified by absence in the clone:

- **No task-tracker coupling.** Nothing equivalent to Lore's Backlog.md JSON
  contract, `link`/`unlink`, status roll-up, or `orphans`.
- **No graph traversal commands.** It has Obsidian's graph *view* and a lint
  pass over links, but no `path`, no `impact`, no bounded blast-radius query.
- **No typed concept schema with validation.** Filing modes are conventions;
  there is no per-type JSON Schema gate equivalent to `lore validate`.
- **No snapshot / diff / provenance-over-time commands.** Its provenance is
  source-to-claim, not fact-to-commit; there is no `changed` between two
  retained projections.
- **No consumer-neutral projection export.** No JSONL projection equivalent to
  `lore export`.
- **Vault-scoped, not repository-scoped.** It targets a personal knowledge
  vault, not a codebase's `docs/` tree coupled to engineering work, and it has
  no multi-repository workspace concept.

## Details

The verbatim capture backing this page — README, file tree, contract files,
and the `gh api` metadata — was taken on 2026-08-12 during the research pass
recorded in
[the competitive landscape](competitive-landscape-agent-native-knowledge-tooling.md).
