## claude-obsidian is a Claude Code plugin / Agent Skills package — NOT an MCP server, not an Obsidian community plugin, and it ships no MCP server of its own. It is loaded with `claude --plugin-dir /absolute/path/to/claude-obsidian` and reaches the vault by direct filesystem reads and atomic writes.

**confidence:** high | **vote:** 3-0 (merged from four independently verified claims, all unanimous)

**sources:**
- https://github.com/AgriciDaniel/claude-obsidian
- https://raw.githubusercontent.com/AgriciDaniel/claude-obsidian/main/README.md
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/.claude-plugin/plugin.json
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/skills/wiki/references/mcp-setup.md
- https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json

**evidence:** Verified structurally, not just by README absence. (a) `grep -c -i mcp` on the raw README returns 0. (b) Repo-wide enumerating grep for MCP implementation markers (modelcontextprotocol|mcp.server|@modelcontextprotocol|stdio_server|FastMCP|jsonrpc|tools/list|mcpServers) across all tracked files returns ZERO hits; .claude-plugin/plugin.json has no mcpServers key and self-describes as 'Local-first Agent Skills package and Claude Code plugin for source-cited Obsidian knowledge bases'; the full recursive git tree (280 paths, truncated:false) contains zero paths matching 'server'/'serve'; hooks/hooks.json uses only "type": "command". (c) Not an Obsidian plugin: absent from obsidianmd/obsidian-releases community-plugins.json (6,606 entries, zero matches for 'claude-obsidian' or owner 'AgriciDaniel'), and the root tree has no manifest.json and no main.js — both mandatory. (d) Filesystem transport confirmed in code: transaction.py:1327-1338 does tempfile.mkstemp + os.replace; no HTTP client exists in core (grep for requests./urllib/httpx/socket./http.client hits only urllib.parse and socket.gethostname). METADATA: public, MIT, Python, 10,807 stars, 1,251 forks, 129 open issues, created 2026-04-07, pushed 2026-08-01, HEAD 1c1bc49, plugin v2.1.0, not archived. TWO TRAPS FOR THE MATRIX: the repo's GitHub topics include `obsidian-plugin` and `claude-plugin` (SEO tags that could mislead); and one third-party aggregator (claudeers.com) falsely claims it probes port 27124 and configures an MCP server — grep for 27124/rest/http over detect-transport.sh returns zero hits, so that secondary source is wrong.

## The invocable agent surface is exactly 15 named Agent Skills (wiki, save, wiki-ingest, wiki-query, wiki-lint, autoresearch, canvas, defuddle, wiki-fold, wiki-mode, wiki-retrieve, wiki-cli, obsidian-markdown, obsidian-bases, think), plus 3 subagents and 2 Claude Code lifecycle hooks, over a portable Python CLI. It is host-portable beyond Claude Code to Codex, OpenCode and Gemini via bin/setup-multi-agent.sh, and to Cursor/Windsurf via workspace-local skill discovery.

**confidence:** high | **vote:** 3-0 (two unanimous claims merged)

**sources:**
- https://github.com/AgriciDaniel/claude-obsidian/tree/main/skills
- https://raw.githubusercontent.com/AgriciDaniel/claude-obsidian/main/README.md
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/claude_obsidian/cli.py
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/bin/setup-multi-agent.sh
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/hooks/hooks.json

**evidence:** `gh api .../contents/skills` returns exactly 15 directories, set-identical to the claimed list, each with a SKILL.md; README H2 is literally '## 15 skills, one system'. CLI subcommands confirmed as real argparse parsers in claude_obsidian/cli.py (1,274 lines; scripts/claude-obsidian.py is a 17-line shim): doctor (L924), transaction apply/recover/inspect (L936/946/961), lint (L975), contracts --verify (L986/990), package validate (L995/999), release build/audit (L1009/1015), capture plan/apply (L1036/1043), migrate (L1163), init (L1177), adopt (L1194), checkpoint (L1211), hook session-start|stop (L968-972), plus mode get|set, extension dragonscale, capture adapters/external/queue, release gates. hooks/hooks.json registers SessionStart (matcher startup|resume|clear|compact) and Stop, both shelling to claude-obsidian.py. agents/ contains verifier.md, wiki-ingest.md, wiki-lint.md. bin/setup-multi-agent.sh usage: '--host codex|opencode|gemini|cursor|windsurf|all', default HOSTS=(codex opencode gemini), 'Cursor and Windsurf require an explicit --workspace destination'. CAVEAT: only 5 of the 15 skills are shown slash-invoked in the README (wiki, wiki-ingest, save, wiki-query, wiki-lint); generalizing slash invocation to all 15 rests on Claude Code plugin-harness behavior, and three skills (obsidian-markdown, obsidian-bases, think) are written as model-invoked references rather than user commands.

## Its distinguishing feature versus every other tool surveyed is a five-step recoverable write transaction with a content-hash approval gate: targets are read and their expected SHA-256 recorded, parallel workers may only return drafts, changes merge into one operation bundle, the bundle is inspected then applied once, and the operation ID plus exact changed paths are reported. Applying requires echoing back `--approved-plan-sha256 HASH --apply`; `--generated-at` and `--operation-id` can be pinned for determinism; a target changed since planning becomes a conflict (exit 75), never a silent overwrite.

**confidence:** high | **vote:** 3-0 on the mechanism; 2-1 on the companion claim that external transports are forbidden from bypassing it

**sources:**
- https://raw.githubusercontent.com/AgriciDaniel/claude-obsidian/main/README.md
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/claude_obsidian/transaction.py
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/claude_obsidian/cli.py
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/skills/wiki/references/operation-transactions.md
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/skills/wiki-cli/SKILL.md

**evidence:** Not README-only: transaction.py is 4,680 lines / 176KB with tests/test_transaction.py at 101KB. Module docstring: 'one process-held mutation lock, precondition hashes, a durable journal, atomic per-file replace, and deterministic rollback/recovery for the complete operation.' Concretely: JOURNAL_SCHEMA = 'claude-obsidian.transaction-journal.v1' (L43); TransactionConflict.exit_code = 75 (L162-163); raise TransactionConflict('EXPECTED_HASH_MISMATCH', f'{normalized} changed since the operation was drafted') (L3441), plus CREATE_TARGET_EXISTS (3446) and FILE_CHANGED_DURING_READ (702); .vault-meta/mutation.lock (L66/1657/1888) using fcntl.flock; os.replace in _atomic_vault_write (L828-874); rollback with hash re-verification (L892-988); CORRUPT_JOURNAL rollback preflight (L3737-3803). UNIVERSALITY CHECKED: _add_approval_argument() (cli.py:115-121) is called on all seven mutating parsers — transaction apply (943), capture apply (1053), mode set (1139), dragonscale (1160), migrate (1174), init (1191), adopt (1208) — enforced by _require_approved_plan() (cli.py:86-108) against plan['approval_sha256']. No mutating command lacks the gate. migrate's --generated-at help is literally 'Pinned ISO timestamp for reproducible migrations'. IMPORTANT MATRIX NUANCE: the prohibition on an external MCP/REST transport writing to the vault is a policy directive an agent follows, not a technical interlock — claude-obsidian cannot physically prevent such a write, but expected_hashes mismatch makes it detect and refuse (exit 75) on the next operation. skills/wiki-cli/SKILL.md: 'Transport choice never changes mutation semantics. The CLI is an optional read surface, not a lock manager, transaction engine, or Git checkpoint mechanism.'

## It ships a link-integrity / vault-health gate directly comparable to a docs-CLI `check` + `orphans`: `wiki-lint` (skill) / `lint --vault PATH [--as-of YYYY-MM-DD]` (CLI) reports dead links, orphans, metadata gaps, stale indexes and empty sections, deterministic for a declared UTC date, read-only, with `--strict` yielding a nonzero exit for CI. Adjacent determinism surfaces: `contracts --verify`, `package validate`, `checkpoint OPERATION_ID`, and `release build --output FILE.zip` which self-audits a byte-reproducible artifact. NOT verified anywhere: stable numeric exit codes per failure class for lint, or any JSON output envelope for lint findings (only `--format markdown` is documented).

**confidence:** high | **vote:** 3-0 (a competing stronger version that asserted the JSON/exit-code gap without scoping it was refuted 0-3)

**sources:**
- https://raw.githubusercontent.com/AgriciDaniel/claude-obsidian/main/README.md
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/skills/wiki-lint/SKILL.md

**evidence:** README L165: '| `wiki-lint` | Reports dead links, orphans, metadata gaps, stale indexes, and empty sections |'; L271: '| `lint --vault PATH [--as-of YYYY-MM-DD]` | Emit findings deterministic for the declared UTC date |'; L272 contracts --verify; L275 checkpoint; L276 package validate; L277 'release build --output FILE.zip | Build and self-audit a deterministic public artifact'. skills/wiki-lint/SKILL.md frontmatter: 'a deterministic, read-only health check'; L29-30: 'Use `--strict` only when a nonzero exit for findings is useful in automation. The command remains read-only either way.'; L32-36 enumerate 'dead or ambiguous links, orphan pages, required frontmatter gaps (including title), empty sections, stale index entries, and source/claim ledger contract violations'. NEGATIVE CAVEAT VERIFIED BY GREP: README 'exit' appears only at L199 (unrelated); README 'json' appears only as .claude-obsidian.json config, the mutating-operation plan, and JSON Canvas — never as a lint output envelope. So the matrix must record claude-obsidian as HAVING an exit-code CI gate (via --strict, and exit 75 for transaction conflicts) but NOT as having verified stable per-class numeric codes or machine-readable JSON lint output.

## claude-obsidian defines an explicit four-step transport selection policy that ranks direct filesystem reads first, the official Obsidian CLI second (read-only, gated by a runtime probe `detect-transport.sh --peek` that actually executes `obsidian version` with a 5s timeout), an MCP or REST adapter only third and only on explicit user approval of the installation, and step four mandates that all mutations stay inside a claude-obsidian operation transaction.

**confidence:** high | **vote:** 3-0

**sources:**
- https://raw.githubusercontent.com/AgriciDaniel/claude-obsidian/main/skills/wiki/references/mcp-setup.md
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/scripts/detect-transport.sh
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/skills/wiki/references/rest-api.md
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/config/adapters.json

**evidence:** mcp-setup.md is titled 'External read transports' (1,900 bytes) and its preamble reads: 'The portable baseline reads vault files directly. The official Obsidian CLI is an optional read surface when runtime probing reports it usable. MCP servers and REST plugins are optional third-party integrations, never prerequisites.' The probe is real, not aspirational: detect-transport.sh L10 usage '--peek [--vault PATH]', L13 '--peek is strictly read-only with respect to the vault', L208 'Peek always probes and never writes', L471 '"probe": "obsidian version"', L258 timeout handling; L410-411 preferred = 'cli' if usable else 'filesystem', chain = ['cli','filesystem'] if usable else ['filesystem'] — filesystem is always the terminal fallback, and MCP entries (mcp_obsidian, mcpvault) are hardcoded {'present': None, 'detection': 'deferred'}, i.e. never auto-selected. rest-api.md independently: 'claude-obsidian does not install it, require it, or use it as a mutation transport… Create, replace, append, patch, move, and delete requests are outside this adapter contract.' config/adapters.json sets 'privacy_default': 'offline' with filesystem the only 'implemented' adapter. plugins.md: 'No community plugin, theme, or downloaded executable is required.' Requirements are only Python 3.11+, Bash, Git; Obsidian itself is optional ('plain Markdown remains usable without it').

## The Obsidian MCP ecosystem splits into two incompatible architectures, and only one is usable headlessly in CI. MarkusPfundstein/mcp-obsidian is a Python MCP server with NO direct disk access — every operation is an HTTP call to the Obsidian Local REST API community plugin (OBSIDIAN_API_KEY required, OBSIDIAN_HOST default 127.0.0.1, OBSIDIAN_PORT default 27124), so it requires the Obsidian desktop app to be running. StevenStavrakis/obsidian-mcp is the opposite: a standalone Node stdio server taking absolute vault paths as CLI args (`npx -y obsidian-mcp <vault> [<vault2>]`, up to 10 vaults), with no HTTP client in the package at all.

**confidence:** high | **vote:** 3-0 on both architecture claims

**sources:**
- https://github.com/MarkusPfundstein/mcp-obsidian
- https://github.com/MarkusPfundstein/mcp-obsidian/blob/main/src/mcp_obsidian/obsidian.py
- https://github.com/MarkusPfundstein/mcp-obsidian/blob/main/src/mcp_obsidian/server.py
- https://github.com/coddingtonbear/obsidian-local-rest-api
- https://github.com/StevenStavrakis/obsidian-mcp
- https://github.com/StevenStavrakis/obsidian-mcp/blob/main/src/main.ts

**evidence:** MarkusPfundstein: 4 source files only; obsidian.py:28-29 get_base_url() returns f'{protocol}://{host}:{port}' and every operation is requests.get/post/put/patch/delete (lines 59,71,82,118,128,182,192,216,230,282,307,332,373); tools.py imports no filesystem module at all; server.py:26-28 hard-fails without OBSIDIAN_API_KEY. Repo description verbatim: 'MCP server that interacts with Obsidian via the Obsidian rest API community plugin'. Installed via `uvx mcp-obsidian`. GUI dependency closed at the dependency's own source: obsidian-local-rest-api 'runs inside Obsidian and requires the desktop application to be active'; 'the plugin cannot run independently without Obsidian'; HTTPS 27124 self-signed / HTTP 27123. METADATA: 4,292 stars, 495 forks, MIT, pushed 2026-05-15, not archived. StevenStavrakis: package.json bin obsidian-mcp → build/main.js, peerDep @modelcontextprotocol/sdk ^1.0.4; src/server.ts:2,268 StdioServerTransport; 17 fs imports across src/; grep over src/ for localhost|127.0.0.1|27123|27124|axios|node-fetch|http:// returns ZERO hits, and runtime deps are only yaml, zod, zod-to-json-schema — a REST transport is architecturally impossible. MAX_VAULTS = 10; no manifest.json and zero `import from "obsidian"`, so it is not an Obsidian plugin. ONE-TIME (not running) dependency: main.ts:216 requires a .obsidian directory to exist — 'Vaults must be initialized in Obsidian at least once'; local filesystem only, network mounts/home-root/external symlinks rejected. METADATA: 721 stars, MIT, created 2024-12-22, pushed 2025-06-23 (~14 months stale despite README claiming 'active development'), npm obsidian-mcp v1.0.6, README warns 'These tools have been tested, but not thoroughly... PLEASE backup your Obsidian vault.'

## MarkusPfundstein/mcp-obsidian's tool surface is 15 registered tools (not 16) — file/text CRUD plus metadata reads — with no tool for links, backlinks, graph traversal, path/impact queries, dangling-link validation, typed-schema checking, or task-tracker coupling. The published PyPI artifact is materially older than the source: pyproject.toml still declares 0.2.2 while PyPI 0.2.2 was uploaded 2025-04-01, before the 2026-05-15 commits that added get_frontmatter and search_by_tag; the README documents only 7.

**confidence:** medium | **vote:** 2-1, with a confirmed off-by-one error the verifier corrected (the claim said 16; 16 is the class count including the abstract base ToolHandler)

**sources:**
- https://github.com/MarkusPfundstein/mcp-obsidian/blob/main/src/mcp_obsidian/tools.py
- https://github.com/MarkusPfundstein/mcp-obsidian/blob/main/src/mcp_obsidian/server.py
- https://pypi.org/project/mcp-obsidian/

**evidence:** `grep -nE '^class ' src/mcp_obsidian/tools.py` → 16 classes = 1 abstract base (L21) + 15 concrete handlers (L31,58,94,130,192,231,301,347,390,454,500,541,580,631,691). Wire names confirmed against the super().__init__ literals: obsidian_list_files_in_vault, obsidian_list_files_in_dir, obsidian_get_file_contents, obsidian_simple_search, obsidian_append_content, obsidian_patch_content, obsidian_put_content, obsidian_delete_file, obsidian_complex_search, obsidian_search_by_tag, obsidian_get_frontmatter, obsidian_batch_get_file_contents, obsidian_get_periodic_note, obsidian_get_recent_periodic_notes, obsidian_get_recent_changes. server.py registers exactly these 15 consecutively (~L42-56); no other module registers tools. Negative half by absence: grep -niE 'backlink|wikilink|\blink\b|graph|dataview|canvas' tools.py returns ZERO hits. DO NOT OVERSTATE: obsidian_get_recent_changes DOES issue a Dataview DQL request internally (obsidian.py:369, Content-Type application/vnd.olrapi.dataview.dql+txt) and obsidian_complex_search passes JsonLogic through — so 'no Dataview anywhere' would be false. Also note the parallel negative claims for obsidian-local-rest-api and StevenStavrakis/obsidian-mcp were REFUTED 0-3, so this finding must NOT be generalized across the ecosystem; each tool needs its own tool-list check. A separate claim that mcp-obsidian's retrieval is lexical-only with no semantic search or token-budgeted assembly failed verification 1-2 and should be treated as unverified.

## coddingtonbear/obsidian-local-rest-api — the substrate the REST-proxy MCP servers depend on — now ships its OWN built-in MCP server inside the Obsidian app at https://127.0.0.1:27124/mcp/, Streamable HTTP with bearer-token auth, exposing 16 tools (vault_list, vault_read, vault_write, vault_append, vault_patch, vault_delete, vault_move, vault_copy, vault_get_document_map, active_file_get_path, search_query, search_simple, tag_list, command_list, command_execute, open_file) plus one MCP resource (obsidian://local-rest-api/openapi.yaml), with documented native Claude Code setup and a plugin extension API (addMcpTool, zod schemas) letting other plugins register more tools.

**confidence:** high | **vote:** 3-0

**sources:**
- https://github.com/coddingtonbear/obsidian-local-rest-api
- https://raw.githubusercontent.com/coddingtonbear/obsidian-local-rest-api/main/README.md
- https://github.com/coddingtonbear/obsidian-local-rest-api/releases/tag/5.1.0

**evidence:** README L282: 'this plugin ships a built-in MCP server that runs inside Obsidian'; L284 '/mcp/'; L286 '**Transport:** Streamable HTTP — API key authentication required.'; L290 endpoint + 'Authorization: Bearer <your-api-key>'; L88-93 verbatim under '#### Claude Code' / 'Claude Code has native HTTP MCP support': claude mcp add --transport http obsidian https://127.0.0.1:27124/mcp/ --header "Authorization: Bearer <your-api-key>". Tool count mechanically diffed from the 'Available tools' table: COUNT=16, diff vs claimed set = IDENTICAL. SHIPPED-CODE CHECK (guarding against docs-ahead-of-release): the released 5.1.0 main.js asset (3,823,143 bytes) contains all 16 tool names, plus 'StreamableHTTP' (5), '/mcp/' (4), the openapi.yaml resource URI (3), '27124' (2). METADATA: 2,788 stars, MIT, not archived, release 5.1.0 published 2026-08-01, pushed 2026-08-03. TWO NUANCES: the https URL uses a self-signed cert requiring trust or TLS-skip (plain-HTTP http://127.0.0.1:27123/mcp/ exists behind a setting); and 16 is the built-in baseline, not a ceiling. IMPORTANT: two stronger claims about this repo — that the maintainer positions it as superseding the third-party MCP servers, and that its endpoint table contains no graph/link/Dataview/semantic surface — were both REFUTED 0-3. Note vault_get_document_map is a structural/graph-adjacent surface, which is likely why the blanket negative failed.

## Obsidian Smart Connections must be recorded in the matrix as source-available/restricted, NOT open source: it is licensed under the proprietary Smart Plugins License (suggested SPDX LicenseRef-SmartPlugins-1.0) with a field-of-use non-compete carve-out, and it is commercially tiered — a paid 'Connections Pro' gates inline connections, configurable algorithms/filters/ranking, Bases integration, large-vault performance indexing, and duplicate detection.

**confidence:** high | **vote:** 3-0, with one correction (footer connections are in the free core tier, not Pro)

**sources:**
- https://raw.githubusercontent.com/brianpetro/obsidian-smart-connections/main/LICENSE
- https://smartconnections.app/legal/license/
- https://smartconnections.app/pro-plugins/
- https://github.com/brianpetro/obsidian-smart-connections/issues/1293

**evidence:** LICENSE header reads 'Smart Plugins License Agreement' — MIT-structured grant with a verbatim carve-out: no use 'as a substantial component of any product or service that: (a) is marketed for use with, or primarily interoperates with, Obsidian or any substantially similar note-taking or knowledge-management application; and (b) is offered as a general-purpose solution to multiple unrelated customers…; and (c) directly competes with any commercial offering of the Licensor based on the Software.' That is a field-of-use restriction and fails OSD #6, so 'not OSI' is definitional, not opinion. Official page: 'The Smart Plugins License is source available: the source is available for auditing and modification, but it includes a restriction on certain competitive uses'; the SPDX identifier is a LicenseRef, i.e. explicitly not on the approved list. TIME-SENSITIVITY THAT MATTERS: the license changed 2025-12-09 (v4 merge), canonical page published 2026-02-23 — pre-Dec-2025 sources say GPLv3, so any matrix built from older data will be wrong. Adversarial check found only corroboration: issue #1293 'License change removes open source protections' and discussion #1294 both argue it is NOT open source. CORRECTION: footer connections are core/free; inline connections are Pro. UNVERIFIED: three further Smart Connections claims failed verification (0-3, 1-2) — that it runs a bundled zero-config offline local embedding model with no API key; the exact shape of its Connections/Lookup retrieval views; and that it offers no MCP server, CLI, HTTP API, or JSON output. Do not populate those matrix cells from this research.

## Basic Memory (basicmachines-co/basic-memory) is the closest structural competitor found to a typed, graph-aware, agent-consumable markdown knowledge base — and unlike claude-obsidian it IS MCP-native. It exposes a fixed tool surface covering note CRUD, search/discovery, projects, an OpenAI-compatibility shim, `build_context` for depth-limited memory:// URL graph traversal, and typed-schema tools schema_infer / schema_validate / schema_diff, with MCP behavior hints (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) on the tools.

**confidence:** high | **vote:** 3-0

**sources:**
- https://github.com/basicmachines-co/basic-memory
- https://github.com/basicmachines-co/basic-memory/blob/main/src/basic_memory/mcp/tools/build_context.py
- https://github.com/basicmachines-co/basic-memory/blob/main/src/basic_memory/mcp/tools/schema.py
- https://docs.basicmemory.com/reference/mcp-tools-reference

**evidence:** Tool surface by category: Content (write_note, read_note, edit_note, move_note, delete_note, read_content, view_note); Search & discovery (search_notes, recent_activity, list_directory); Knowledge graph (build_context); Projects (list_memory_projects, list_workspaces, create_memory_project, delete_project); Schema (schema_infer, schema_validate, schema_diff); Compatibility (search, fetch, basic_memory_diagnostics). Verified in source, not README alone: build_context.py:119 description 'Build context from a memory:// URI to continue conversations naturally', :198 'url: memory:// URI pointing to discussion content (e.g. memory://specs/search)', :271 is_memory_url=str(url).startswith('memory://'), :217 depth-configurable example build_context('work-docs', 'memory://components/memory-service', depth=2). schema.py defines schema_validate (L250), schema_infer (L389), schema_diff (L517). GitHub code search for readOnlyHint returns 20 files spanning essentially every tool module; concrete annotations e.g. build_context.py:142-146 {readOnlyHint:True, destructiveHint:False, openWorldHint:False}, write_note.py:61-66 {readOnlyHint:False, destructiveHint:True, idempotentHint:False, openWorldHint:False}. METADATA: 3,642 stars, AGPL-3.0 (copyleft — relevant if any code were ever borrowed), public, not archived, pushed 2026-08-13. NUANCE: read-only tools omit idempotentHint, carrying three of four hints; the 'every tool' phrasing is inherited from the project's own README.

## Synthesized adoption candidates for a deterministic repo-resident docs+graph CLI, ranked by evidence strength: (1) a hash-gated, journalled, recoverable multi-file write transaction with an inspect-approve-apply cycle and conflict-on-drift instead of silent overwrite; (2) `--as-of YYYY-MM-DD` date pinning so lint/check findings are reproducible for a declared UTC date, plus pinned `--generated-at`/`--operation-id` for reproducible mutations; (3) a byte-reproducible release build that self-audits (RELEASE_MANIFEST.json + SHA256SUMS); (4) typed-schema tooling in the Basic Memory shape — infer a schema from existing content, validate against it, diff two schema versions; (5) MCP behavior hints (readOnlyHint/destructiveHint/idempotentHint/openWorldHint) on every exposed tool; (6) multi-host agent-instruction emission beyond Claude Code (Codex, OpenCode, Gemini, Cursor, Windsurf) from one source of truth; (7) a self-validating package/plugin manifest checker that checks skills, hooks, manifests and documentation coherence together; (8) a capability-readiness contract runner and an explicit runtime probe that distinguishes 'present' from 'verified'.

**confidence:** medium | **vote:** synthesis across findings, not itself adversarially voted

**sources:**
- https://raw.githubusercontent.com/AgriciDaniel/claude-obsidian/main/README.md
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/claude_obsidian/transaction.py
- https://github.com/AgriciDaniel/claude-obsidian/blob/main/scripts/detect-transport.sh
- https://github.com/basicmachines-co/basic-memory/blob/main/src/basic_memory/mcp/tools/schema.py
- https://github.com/basicmachines-co/basic-memory/blob/main/src/basic_memory/mcp/tools/build_context.py
- https://github.com/coddingtonbear/obsidian-local-rest-api

**evidence:** Each item traces to a verified capability above rather than to a blog roundup. Items 1-3 and 6-8 come from claude-obsidian's shipped code (transaction.py 4,680 lines with 101KB of tests; cli.py argparse surface; bin/setup-multi-agent.sh; detect-transport.sh's 'Binary or configuration presence alone means available, not verified'). Items 4-5 come from Basic Memory's source. NOTE ON THE BRIEF'S OTHER GAP HYPOTHESES: the research did NOT verify the semantic/embedding-search, temporal/bitemporal-graph, visual-graph-explorer, canvas, transclusion, publishing, multiplayer-sync, LSP, watch-mode, incremental-indexing, or eval-harness gap candidates — the Smart Connections embedding claims and all three Obsidian graph-view claims (untyped node model, dangling links as UI state not CI failure, local-graph depth as the only traversal affordance) were REFUTED or failed verification, so no evidence-backed statement about Obsidian's graph semantics survived. Treat those rows of the matrix as unpopulated, not as confirmed gaps.

## Verified maturity/licensing row data for the matrix, all from GitHub API or registry primary sources on 2026-08-12.

**confidence:** high | **vote:** 3-0 (metadata collected across all verifications)

**sources:**
- https://api.github.com/repos/AgriciDaniel/claude-obsidian
- https://api.github.com/repos/MarkusPfundstein/mcp-obsidian
- https://api.github.com/repos/coddingtonbear/obsidian-local-rest-api
- https://api.github.com/repos/StevenStavrakis/obsidian-mcp
- https://api.github.com/repos/basicmachines-co/basic-memory
- https://smartconnections.app/legal/license/

**evidence:** AgriciDaniel/claude-obsidian — MIT, Python, 10,807 stars, 1,251 forks, 129 open issues, created 2026-04-07, pushed 2026-08-01, HEAD 1c1bc49, v2.1.0, not archived, not a fork. MarkusPfundstein/mcp-obsidian — MIT, Python, 4,292 stars, 495 forks, pushed 2026-05-15, not archived; PyPI mcp-obsidian 0.2.2 uploaded 2025-04-01 (published artifact lags source). coddingtonbear/obsidian-local-rest-api — MIT, 2,788 stars, release 5.1.0 published 2026-08-01, pushed 2026-08-03, not archived. StevenStavrakis/obsidian-mcp — MIT, 721 stars, created 2024-12-22, pushed 2025-06-23 (~14 months without a commit), npm obsidian-mcp v1.0.6, not archived but effectively dormant. basicmachines-co/basic-memory — AGPL-3.0, 3,642 stars, pushed 2026-08-13, not archived. brianpetro/obsidian-smart-connections — Smart Plugins License / LicenseRef-SmartPlugins-1.0, source-available with non-compete, license changed 2025-12-09; free core + paid Connections Pro (14-day trial); star count NOT captured in this research.

