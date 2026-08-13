# Primary-source verified facts (gathered directly, 2026-08-12)

Method: `gh api` against live repos + a local `--depth 50` clone of claude-obsidian
(HEAD 1c1bc49, tag v2.1.0) + direct introspection of the installed `lore` binary
in /Volumes/external/repos/lore-cli.

## Repo metadata (gh api, 2026-08-12)

| repo | stars | license | last push | archived | lang |
|---|---|---|---|---|---|
| AgriciDaniel/claude-obsidian | 10807 | MIT | 2026-08-01 | no | Python |
| kepano/obsidian-skills | 45184 | MIT | 2026-06-08 | no | - |
| foambubble/foam | 17344 | NOASSERTION | 2026-08-11 | no | TypeScript |
| dendronhq/dendron | 7461 | Apache-2.0 | 2025-11-13 | no | TypeScript |
| basicmachines-co/basic-memory | 3642 | AGPL-3.0 | 2026-08-13 | no | Python |
| MarkusPfundstein/mcp-obsidian | 4292 | MIT | 2026-05-15 | no | Python |
| StevenStavrakis/obsidian-mcp | 721 | MIT | 2025-06-23 | no | TypeScript |
| coddingtonbear/obsidian-local-rest-api | 2787 | MIT | 2026-08-03 | no | TypeScript |
| MrLesk/Backlog.md | 6452 | MIT | 2026-08-10 | no | TypeScript |
| github/spec-kit | 126469 | MIT | 2026-08-12 | no | Python |
| eyaltoledano/claude-task-master | 27991 | NOASSERTION | 2026-04-28 | no | JavaScript |
| getzep/graphiti | 29866 | Apache-2.0 | 2026-08-12 | no | Python |
| mem0ai/mem0 | 63141 | Apache-2.0 | 2026-08-12 | no | Python |
| letta-ai/letta | 24217 | Apache-2.0 | 2026-08-01 | no | Python |
| topoteretes/cognee | 29981 | Apache-2.0 | 2026-08-12 | no | Python |
| logseq/logseq | 44420 | AGPL-3.0 | 2026-08-12 | no | Clojure |
| siyuan-note/siyuan | 45775 | AGPL-3.0 | 2026-08-13 | no | TypeScript |
| jackyzha0/quartz | 12995 | MIT | 2026-08-12 | no | TypeScript |

claude-obsidian repo description also claims: 1251 forks, created 2026-04-07,
homepage agricidaniel.com/blog/claude-obsidian-ai-second-brain,
"Based on Karpathy's LLM Wiki pattern".

## claude-obsidian: architecture (read from the clone, not the README alone)

- 39,642 lines of Python total; 18,762 in the `claude_obsidian/` package.
  Largest modules: transaction.py (4680), release.py (2591), capture.py (2231),
  checkpoint.py (1366), contracts.py (1365), ledgers.py (1351),
  lint_engine.py (1279), cli.py (1274).
- Distribution: Claude Code **plugin** (.claude-plugin/plugin.json +
  marketplace.json), 15 Agent Skills under skills/*/SKILL.md (1721 lines total),
  3 subagents (agents/verifier.md, wiki-ingest.md, wiki-lint.md),
  SessionStart + Stop hooks (hooks/hooks.json).
- Multi-host: AGENTS.md, GEMINI.md, .cursor/rules/, .windsurf/rules/,
  .github/copilot-instructions.md, bin/setup-multi-agent.sh --host codex.
- NOT an MCP server. MCP is an optional third-party adapter
  (skills/wiki/references/mcp-setup.md); Obsidian Local REST API is
  read/search-only and off by default (references/rest-api.md).

### Data model — two ledgers + a raw manifest (ledgers.py, provenance.md)
- `.raw/.manifest.json` — ingestion hashes, generated pages, address map.
- `wiki/meta/ledgers/source-ledger.json` — schema `claude-obsidian.source-ledger.v1`
- `wiki/meta/ledgers/claim-ledger.json` — schema `claude-obsidian.claim-ledger.v1`
- Enumerations, verbatim from ledgers.py:
  - AUTHORITIES = official | primary | secondary | community | synthetic | unknown
  - SOURCE_STATUSES = unreviewed | active | superseded | rejected
  - CLAIM_RISKS = normal | high
  - CONFIDENCES = high | medium | low | unknown
  - EVIDENCE_RELATIONS = supports | contradicts | context
  - CLAIM_ASSESSMENTS = accepted | provisional | contested | unsupported | deprecated
- Rules: accepted claims need >=1 fresh, active, non-synthetic source;
  high-risk accepted claims need TWO INDEPENDENT sources; `independence_key`
  de-duplicates non-independent sources; canonical-URL normalization
  (IPv6/IDN/Unicode/dot-segment/default-port/percent-encoding) prevents fake
  independence; contradictions are preserved, never silently resolved;
  `unsupported` is the canonical no-data state; grounded refusal preferred
  over invented citation. Staleness derives from `refresh_due` (single source
  of truth, no second stale flag).

### Write model — plan/approve/apply transactions (transaction.py, README)
- Every mutating command is two-phase: emit a JSON plan with
  `approved_plan_sha256`, then re-run with `--approved-plan-sha256 <hash> --apply`.
- The hash binds to the canonical resolved vault root — it cannot be replayed
  against a different vault.
- One logical operation = one `claude-obsidian.transaction.v1` bundle =
  one recoverable apply. Read every target, record expected SHA-256 (or null
  if it must be absent); a changed target is a CONFLICT, never a silent overwrite.
- Process-lifetime vault lock, journaled backups, atomic replacement,
  `transaction recover` restores an interrupted operation.
- Parallel subagents return DRAFTS ONLY; only the orchestrator applies.
- Determinism inputs are pinned explicitly: `--generated-at`, `--operation-id`,
  and `lint --as-of YYYY-MM-DD`.

### Lint engine (lint_engine.py finding codes, verbatim)
dead_links, dangling_links, allowlisted_dangling_links, allowed_dangling_links,
stale_index_entries, missing_frontmatter, missing_fields, empty_sections,
duplicate_basenames, ambiguous_targets, provenance_errors, read_errors,
configuration_errors; plus counters pages_scanned, links_scanned, issues_found,
category_counts, engine_version, as_of. Allowlist at
`.vault-meta/lint-allowlist.json`.

### Retrieval (skills/wiki-retrieve, scripts/)
- Pipeline: contextual-prefix.py (1007 lines; paragraph-boundary chunking +
  page-level prefix) -> bm25-index.py (851 lines; stdlib BM25) -> retrieve.py
  -> rerank.py (optional cosine).
- Default reranker: Ollama `nomic-embed-text-v2-moe` (~958 MB), never
  auto-pulled; `search_query:`/`search_document:` prefixes; 512-token context.
- Fallback is deterministic and total: any embedding failure reverts the WHOLE
  result set to BM25 order; it never mixes cosine and BM25 score scales.
- Incremental: prefixing skips records whose chunk+page hashes match; a full
  scan removes surplus records; the prefixer invalidates the BM25 index before
  changing the chunk set so a mixed stale index is never served.
- Caches live in `.vault-meta/` (derived, disposable), never in canonical notes.
- Egress is consent-gated: `--allow-egress`, `--allow-remote-ollama`; consent is
  never inferred from a present API key or installed binary.
- retrieve.py exits 10 on missing/corrupt index with a stable rebuild command.

### Capability honesty (config/capabilities.json)
Each capability declares tier, implementation_paths, read_scope, write_scope
(with access: create_only | transactional), needs.shell/needs.network,
transaction_type, confirmation{mutation, network_egress, destructive},
verification_command AND verification_reason — an explicit, machine-readable
statement of *why* something is unverified. `contracts --verify` executes them.
README publishes an "Honest capability boundaries" table (PDF/EPUB: metadata +
hash only, no semantic extraction; URL/YouTube/OCR need an external runner).

### Filing methodologies (wiki-mode)
Generic (default) | LYT | PARA | Zettelkasten. Switching modes routes NEW notes
only; it never bulk-reorganizes existing ones.

### Release engineering
Byte-reproducible `release build`, `release audit` on the zip without
extracting, SHA256SUMS, RELEASE_MANIFEST.json, config/release-allowlist.json.
Artifacts reject contributor state, root raw sources, private paths, personal
emails, secrets, symlinks, unsafe archive entries, unreviewed binaries.
No command pushes, tags, publishes, or releases automatically.
CI: Linux + macOS matrix + native-Windows smoke. Native Windows = read-only /
dry-run works; vault writes require WSL and fail closed with UNSUPPORTED_PLATFORM.

### Lineage
Karpathy's LLM Wiki gist + kepano/obsidian-skills (45k stars, MIT) as the
reference substrate for Obsidian Markdown, Bases, and JSON Canvas.

## lore: verified locally

- `lore 0.1.1` binary on PATH; README/docs describe `@opum-ai/lore@0.2.0`.
- 28 commands (from `lore help --json`): init, new, validate, check, replace,
  rename, supersede, link, unlink, sync, tasks, orphans, schema, scaffold,
  graph, path, impact, snapshot, changed, provenance, explorer, export, query,
  context, agent, instructions, agents, help.
- Concept types (.lore/schemas/): ADR, AttestedComputation, Epic, Reference,
  Runbook, Spec, Story.
- Exit codes: 0 ok, 2 usage, 3 not_found, 4 denied, 5 conflict, 6 validation/drift.
- Output precedence --json > --plain > pretty; `{schemaVersion, kind, data}`
  envelope; errors `{error_type, message, hint, input}` on stderr.
- `lore check` on this repo: "65 files, 0 errors, 0 warnings", unpiped exit 0.
- OKF: the built-in producer profile targets **OKF 0.2** (`lore init` writes
  `okf_version: "0.2"`); a custom profile may target 0.1. The checked-in bundle
  here is still 0.1 and is deliberately NOT auto-migrated. So lore already
  recognizes OKF 0.2's `sources[]`, `generated`, `verified`, `status`,
  `stale_after`, and the `Attested Computation` type — but it explicitly does
  NOT import, bind, evaluate, or attest computation assets.
- Confirmed ABSENT in src/: watch mode, MCP server (deferred, ADR-0004/0018;
  docs/reference/mcp-tools.md is an ON HOLD design), embeddings / semantic /
  vector search (`lore query` is lexical full-text + frontmatter filters).
- OKF v0.2 spec confirmed live at Version 0.2 (knowledge-catalog/okf/SPEC.md);
  §13 breaking changes: `timestamp` -> `generated.at`, body `# Citations` ->
  frontmatter `sources`.
