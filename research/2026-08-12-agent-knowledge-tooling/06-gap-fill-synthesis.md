# Competitive analysis: `lore` in the OKF / repo-resident-docs field

**As of the survey date (2026-08-12/13).** Every star count, version, and command surface below is a *then-current* observation, not a standing fact. Where a claim was overturned during adversarial verification I say so explicitly.

---

## 1. Field map

Nine categories surround lore. Only three contain genuine competitors.

| # | Category | Best representative | Competitor or adjacent? |
|---|---|---|---|
| 1 | **OKF spec home + reference tooling** | [GoogleCloudPlatform/knowledge-catalog `okf/`](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) (Apache-2.0, 8,537★) | **Adjacent — and it is lore's upstream.** It ships [SPEC.md v0.2](https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md), a Gemini+BigQuery enrichment agent, and a Cytoscape viewer — but no validator, no releases, no tags. A recursive scan of all 405 repo paths found no validator, JSON schema, or linter anywhere. The normative owner ships no conformance tooling, which is exactly the vacuum the CLIs are filling. |
| 2 | **OKF authoring/validating CLIs** | [okfcli/okf](https://github.com/okfcli/okf) (Apache-2.0, 17★, Go) | **Genuine competitors — the head-to-head category.** Also [serradura/okf-gem](https://github.com/serradura/okf-gem) (120★, Ruby, still v0.1), [scaccogatto/okf-skills](https://github.com/scaccogatto/okf-skills) (254★, the de-facto v0.2 conformance checker), [gsemet/okf-schema](https://github.com/gsemet/okf-schema) (14★, per-type JSON Schema), [openknowledge-sh/okn](https://github.com/openknowledge-sh/openknowledge) (43★, 27 commands, telemetry on by default). |
| 3 | **OKF consume-side engines** | [travisjakel/okf-ingest](https://github.com/travisjakel/okf-ingest) (Apache-2.0, 4★) | **Genuine competitor for the read half.** Deliberately does not author ([README:535](https://github.com/travisjakel/okf-ingest)). Owns `context`/`impact`/`diff`/`rank` — lore's verb family — and argues lore's determinism thesis back at it. Low stars, highest substance-per-star in the field. |
| 4 | **Code→OKF generators** | [jyjeanne/okf-rs](https://github.com/jyjeanne/okf-rs) (72★, Rust) | **Adjacent — different input, overlapping output.** It derives concepts from source via tree-sitter; lore records decisions a human made. It competes only where both write a bundle a reviewer reads. |
| 5 | **Rival repo-resident doc specs** | [open-doc-spec/ods](https://github.com/open-doc-spec/ods) (Apache-2.0, 4★) | **Genuine strategic competitor, and the sharpest one.** It has absorbed OKF as a *flag* (`ods lint --okf`) and published [the line it draws](https://raw.githubusercontent.com/open-doc-spec/ods/main/docs/other-specs/frontmatter-keys-ods-vs-okf.md): ODS for docs describing **software systems**, OKF for docs describing **data/knowledge assets**. If that framing sticks, an OKF-native CLI for a *code* repo is fighting the spec's grain. |
| 6 | **LLM-authored wiki producers** | [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) (MIT, 14,956★) | **Adjacent, opposite bet, and the reach leader.** Real OKF v0.1 code in-tree (`src/okf/frontmatter.ts`, `src/agent/okf-middleware.ts`). Requires one of 12 model providers. If lore needs one number for "is the deterministic OKF bet lonely" — the volume winner in OKF output is LLM-authored by ~14,900 stars to ~250. |
| 7 | **Spec-driven-development frameworks** | [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) (MIT, 64,697★) | **Adjacent — different artifact class (requirements, not decisions).** OpenSpec is the most deterministic of them: real Zod-backed validation with stable named rule codes, verified from the [published 1.8.0 tarball](https://registry.npmjs.org/@fission-ai/openspec), not the README. [spec-kit](https://github.com/github/spec-kit) (126k★) has no deterministic validator at all — its `analyze` is a read-only LLM prompt. [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) (52k★) is an installer with exactly three commands. Star counts in this category are near-uncorrelated with shipped machinery. |
| 8 | **Task trackers** | [MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md) (MIT, 6,451★) | **A dependency, not a competitor** — and it has the gap that justifies lore. Empirically probed at 1.49.3: `--doc docs/nope.md` is accepted with **exit 0**; the `documentation[]` field has no referential integrity. Its exit codes are binary 0/1. [claude-task-master](https://github.com/eyaltoledano/claude-task-master) is the counter-example: `validate-dependencies` against a missing tasks file returns **exit 0**, and it is MIT WITH Commons-Clause, i.e. not OSI-open. |
| 9 | **Agent-memory engines** | [getzep/graphiti](https://github.com/getzep/graphiti) (Apache-2.0, 29,866★) | **Not competitors** — different substrate (databases, not repo files) and LLM-dependent extraction. Worth reading for ideas only. [mem0](https://github.com/mem0ai/mem0/blob/main/docs/migration/oss-v2-to-v3.mdx) deleted graph memory from OSS entirely in v3. [Mnemosyne](https://github.com/mnemosyne-oss/mnemosyne/blob/main/mnemosyne/core/triples.py) is the local-first outlier and the only deterministic one. |
| 10 | **PKM graph engines** | [zetl](https://codeberg.org/anuna/zetl) (AGPL-3.0-or-later, 5★ on Codeberg) | **Genuine competitor by feature overlap, near-zero by adoption.** Typed edges, CI check gate, jj-backed time travel, MCP, self-installing SKILL.md — the deepest overlap of anything surveyed. Also [Foam](https://github.com/foambubble/foam) (17,344★, now a real headless CLI + [25-tool MCP server](https://github.com/foambubble/foam/blob/main/packages/foam-mcp/README.md)) — the most credible *mainstream* competitor. [Logseq](https://github.com/logseq/logseq/blob/master/docs/cli/logseq-cli.md)'s CLI targets a SQLite graph under `~/logseq/graphs`, so it cannot be pointed at a repo's `docs/`. [Dendron](https://github.com/dendronhq/dendron) is dead ("maintenace only", sic). [Quartz](https://github.com/jackyzha0/quartz) is a publishing pipeline with nothing to query from a terminal. |
| 11 | **Non-rival layers** | [MCP Resources](https://modelcontextprotocol.io/specification/latest/server/resources), [llms.txt](https://llmstxt.org/), [AGENTS.md](https://github.com/agentsmd/agents.md) | **Distribution surfaces, not rivals.** MCP Resources carry seven metadata fields, no schema, no graph, no provenance; change signalling is a payload-free ping, which is why okf-mcp had to build `okf_diff` on top. `okn export html` writes an llms.txt *into* its bundle. okf-rs `init` writes AGENTS.md and makes CLAUDE.md a one-line import. |

**The demand signal that matters most is category 11's ugly cousin:** [Cline Memory Bank](https://github.com/cline/cline/blob/main/docs/best-practices/memory-bank.mdx) is a prompt methodology prescribing six markdown files with zero code, zero validation, zero automation — and it is one of the most-copied patterns in agentic coding. Its documented dependency hierarchy exists **only as a PNG**. That is lore's addressable market stated as a defect.

---

## 2. Where lore is genuinely differentiated

Ordered by confidence, and I have downgraded three claims that look unique only because of thin coverage.

### High confidence

**1. Task-tracker coupling with referential integrity in both directions.** Across all 30+ surveyed tools, `task_tracker_coupling=yes` appears only where the tool **is** the tracker ([Backlog.md](https://github.com/MrLesk/Backlog.md), [task-master](https://github.com/eyaltoledano/claude-task-master)) or owns tasks inside its own graph ([Logseq](https://github.com/logseq/logseq/blob/master/docs/cli/logseq-cli.md)). Zero OKF tools have it — verified by direct grep for okf-ingest (`jira|github issue|task_id|tracker|backlog|asana` → zero matches in-repo) and okf-rs (zero hits in `crates/**/*.rs`). [spec-kit](https://github.com/github/spec-kit)'s `taskstoissues` is the closest and it is LLM-driven, one-way, with no ID round-trip. **And the coupled tracker has a verified hole lore fills:** Backlog.md accepts a nonexistent `--doc` path with exit 0. lore's `doc:<id>` back-reference plus a `check` gate over task↔doc edges is the only mechanism in this survey that makes a task→doc edge falsifiable. This is the differentiator to lead with.

**2. Attested Computation as an *authorable* typed concept.** [SPEC §10](https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md) defines it; only two tools touch it, both read-side: scaccogatto's validator has `check_computation`, and okf-rs enforces one conditional rule (non-empty `runtime`). Nobody else authors it. Genuinely unique — but see the honesty note below, because unique-and-unconsumed is not yet valuable.

**3. Six-way differentiated exit codes (0/2/3/4/5/6).** The finest granularity observed. Comparators: [okfcli](https://github.com/okfcli/okf#commands) 0–4, [Foam](https://github.com/foambubble/foam) 0/1/2 with "2 is CI-friendly", Backlog.md 0/1, OpenSpec 0/1 (19 `process.exit(1)` vs 3 `process.exit(0)`), task-master **broken as a gate** (exit 0 on error). Real but modest — most tools' exit codes were never probed.

### Medium confidence — unique as an *intersection*, not as a capability

**4. OKF-native + per-type JSON Schema + full authoring lifecycle in one deterministic binary.** Each ingredient exists elsewhere. Per-type schemas: [gsemet/okf-schema](https://github.com/gsemet/okf-schema#what-okf-schema-adds-to-okf) (schemas under `_schema/`, `type` selects the file), [iwe](https://github.com/iwe-org/iwe) (glob-bound `.iwe/schemas/*.yaml`, verified enforcing enum + ISO date + required field + required section, exit 1), [ODS](https://github.com/open-doc-spec/ods) profiles, [okf-rs](https://github.com/jyjeanne/okf-rs) (hand-rolled, verified exit 1 on four distinct typed errors). Authoring lifecycle verbs (`supersede`, `replace`, `rename`, `link`/`unlink`, `sync`): okf-ingest deliberately has none, scaccogatto only validates, okfcli's enumerated package tree has none, okf-gem's 16 verbs include none. So the *combination* looks unique — but "unique intersection" is a much weaker claim than "unique capability", and it is the kind of claim a single competitor release erases.

**5. A stated posture of deliberate absence** (no MCP, no watch, no embeddings). This is only a differentiator if lore *declares* it as a conformance and threat-model statement. Undeclared, it reads as missing features — which is exactly how a reader will score it against okf-gem, zetl, Foam, iwe, okf-rs, and okf-mcp, all of which ship MCP.

### Downgraded — do not claim these

- **Deterministic no-LLM core.** Not differentiating. okfcli, okf-gem, okf-ingest (byte-identical across 3 runs, sha1 `caf1d891…`), okf-rs, iwe, ODS, zetl, Foam, Mnemosyne are all deterministic. It is table stakes in this field, not an edge.
- **Generated SKILL.md bridge.** Common: okf-gem `okf skill .claude`, [zetl](https://codeberg.org/anuna/zetl) `zetl skill init` (embedded in the binary so skill and CLI version together — better than lore's approach if lore's is not), Logseq `skill install`, ODS `ods skill install`, spec-kit (30+ agents), BMAD.
- **Graph traversal / impact / snapshot.** A crowded club: okf-ingest (verified — reverse-BFS transitive closure, exact Personalized PageRank, `WITH RECURSIVE` over DuckDB), okf-rs (verified — callers/callees/cycles/BFS path/communities, plus 30-concept blast radius), iwe (verified — a real query language with `$includes`/`$referencedBy` and `maxDistance`, transitive closure confirmed on a 4-node chain), ODS (verified transitive `context`), zetl, Foam (`traverse_graph`, BFS capped at depth 5).

---

## 3. Where lore is behind

Concrete, named, with the tool that does it better.

| Gap | Who does it better | How |
|---|---|---|
| **SARIF output** | [okfcli](https://github.com/okfcli/okf#commands), [ODS](https://github.com/open-doc-spec/ods) | `okf validate --format sarif --exit-zero` emits SARIF 2.1.0 for GitHub code scanning. ODS's `lint --format sarif` was verified emitting valid SARIF with populated results. lore has no path into the GitHub Security tab. |
| **Stable machine-readable rule IDs** | [okfcli](https://github.com/okfcli/okf#commands), [OpenSpec](https://registry.npmjs.org/@fission-ai/openspec) | okfcli findings carry `okf/links/broken`, `okf/frontmatter/type-required`, so CI suppresses or routes by ID rather than message text. OpenSpec has ~25 named codes (`REQUIREMENT_NO_SHALL`, `CHANGE_NO_DELTAS`, …). lore's findings, on the given description, have no stable IDs — which means no suppression story and no safe message-text evolution. |
| **Machine-readable CLI self-description** | [okfcli](https://github.com/okfcli/okf#commands) | `okf schema [command]` emits every command's flags, args, output format, and exit codes so an agent learns the whole surface in one call. lore's `schema` covers concept types; the *command surface* is only reachable via `help`/`instructions`, which are prose. |
| **Date-pinned deterministic findings** | claude-obsidian (`lint --as-of YYYY-MM-DD`) — *from the prior pass, unverified here* ([repo](https://github.com/AgriciDaniel/claude-obsidian)) | OKF has `status` and `stale_after` (an absolute date, not a TTL). Any check that evaluates staleness against wall-clock is **non-reproducible by construction** — the same commit passes today and fails tomorrow. This is a determinism bug hiding inside lore's headline claim. |
| **Proof of determinism** | [okf-rs](https://github.com/jyjeanne/okf-rs) `generate --check-determinism`; [okf-ingest](https://github.com/travisjakel/okf-ingest) cross-language parity locking R and Python to byte-identical catalogs | Both make determinism a *test*, not a sentence in a README. lore asserts it. A gate never observed failing is not known to work. |
| **Ranked / token-budgeted context** | [okf-ingest](https://github.com/travisjakel/okf-mcp#tools) `okf context --rank ppr`; [ODS](https://github.com/open-doc-spec/ods) `ods context` + `ods bench` | okf-ingest ranks a concept's neighbourhood by **exact** Personalized PageRank over the author-written link graph (or plain BFS), or lexically-seeded multi-PPR from a free-text query. ODS computes a bounded reading list in <5ms and reports token ROI as a command. The given description of `lore context` states no ranking function and no budget. |
| **Incremental gate adoption** | [scaccogatto](https://raw.githubusercontent.com/scaccogatto/okf-skills/main/skills/validate/scripts/okf_validate.py) `--max-warnings N`; [okf-gem](https://okfgem.com/docs/cli/validate/) `--fail-on warn` | A ratchet lets a repo turn the gate on today with 40 outstanding warnings and drive the number down. Without one, `lore check` is all-or-nothing and adoption stalls at the first legacy bundle. |
| **Legacy adoption / migration** | [ODS](https://github.com/open-doc-spec/ods) `ods adopt <dir>`; [scaccogatto](https://github.com/scaccogatto/okf-skills) `--migrate` | `ods adopt` scans non-ODS markdown and drafts frontmatter as `status: draft`. scaccogatto's `--migrate` does an in-place v0.1→v0.2 upgrade, rewriting a `# Citations` body list into a `sources:` block. lore has `init` and `new` — nothing for the 200 markdown files already in the repo. |
| **Packaged CI surface** | [scaccogatto](https://github.com/scaccogatto/okf-skills) composite Action (`uses: scaccogatto/okf-skills@v1`); [ODS](https://github.com/open-doc-spec/ods) Marketplace action + `ods setup --git-hooks`; [okf-rs](https://github.com/jyjeanne/okf-rs) PR-review Action | scaccogatto's Action works in repos with **no agent at all** — a distribution channel lore currently doesn't have. |
| **Write-transaction safety** | [iwe](https://github.com/iwe-org/iwe) `expect` guards | Every mutation must declare how many documents and blocks it may touch; the whole update validates before anything is written and aborts naming the offending blocks. Verified: `--expect 99` against 4 matches aborted with exit 2 naming each document, and `--strict` without a guard refused outright. **Over MCP the guards are mandatory** — an edit that won't declare its blast radius is refused. lore is a tool agents *write* through and has nothing equivalent on the given description. |
| **Blast-radius review artifact** | [okf-rs](https://github.com/jyjeanne/okf-rs) `review <ref-a> <ref-b> --fail-on-risk` | Verified: emits sticky-comment-ready markdown with an HTML marker and a table, exits 1 with the flag and 0 without. lore has `impact` but no reviewer-facing renderer and no merge gate. |
| **Declared conformance divergence** | [gsemet/okf-schema](https://github.com/gsemet/okf-schema#what-okf-schema-adds-to-okf) | Its README quotes SPEC §4.1 back at itself and concedes that requiring registered types "is not allowed in OKF specification." **lore has the same divergence and, on the given description, does not declare it.** SPEC §11 has only three hard rules and says consumers MUST NOT reject on broken links, unknown types, or unknown keys — yet lore validates seven registered types per-schema and gates on `check`. The ecosystem is split on this: okf-gem states outright "Do not expect broken links to fail validation. They are warnings by design"; scaccogatto makes them warnings tolerated under §6.1, fatal only under `--strict`; okfcli makes them hard exit-1, stricter than the spec. Being strict is defensible. Being strict silently is a defect. |
| **MCP server** | [okf-gem](https://github.com/serradura/okf-gem) (`okf-mcp` with output schemas), [okf-mcp](https://github.com/travisjakel/okf-mcp#tools), [okf-rs](https://github.com/jyjeanne/okf-rs), [iwe](https://github.com/iwe-org/iwe) (`iwec`, 14 tools), [Foam](https://github.com/foambubble/foam/blob/main/packages/foam-mcp/README.md) (25 tools, explicit `mode: 'read' \| 'read-write'`), [zetl](https://codeberg.org/anuna/zetl) (9 tools), [Backlog.md](https://github.com/MrLesk/Backlog.md) (20 tools) | Deferred deliberately. Defensible, but it is now the single most common capability in the field and lore's own coupled tracker ships one. |

---

## 4. Ranked adoption candidates

Ranked by **(value to an agent consuming the bundle) ÷ (risk to determinism)**. All "Adopt" items carry **zero** determinism risk unless stated.

### ADOPT

**A1. `--as-of YYYY-MM-DD` on `check`, `validate`, `query`, `context`.**
*What:* pin every date-relative evaluation (`stale_after`, `status` staleness, `usage_window`) to a supplied date instead of wall-clock. Default to the commit date, or refuse to compute staleness without a pin.
*Prior art:* claude-obsidian `lint --as-of` (prior pass, **unverified in this survey**).
*Surface:* `lore check --as-of 2026-08-12`, honored by every date-sensitive rule; `lore check --as-of git` reads the HEAD commit date.
*Effort:* small. *Risk:* none — it **increases** determinism.
*Determinism:* strictly protective. **This is the highest-value item in the list because it closes a hole in lore's core claim, not just adds a feature.**

**A2. Stable rule IDs on every finding, plus suppression.**
*What:* `lore/link/dangling`, `lore/schema/type-unknown`, `lore/task/doc-missing` on every diagnostic; suppress and route by ID.
*Prior art:* [okfcli](https://github.com/okfcli/okf#commands), [OpenSpec](https://registry.npmjs.org/@fission-ai/openspec).
*Surface:* IDs in the JSON envelope's finding objects; `lore check --disable lore/link/dangling`, `lore check --only lore/task/*`.
*Effort:* small-medium (needs a frozen ID registry and a stability policy). *Risk:* none.
*Prerequisite for A3, A4, A5.*

**A3. `--max-warnings N` ratchet and `--fail-on error|warn`.**
*What:* let a repo adopt the gate incrementally and drive the count to zero.
*Prior art:* [scaccogatto](https://raw.githubusercontent.com/scaccogatto/okf-skills/main/skills/validate/scripts/okf_validate.py), [okf-gem](https://okfgem.com/docs/cli/validate/).
*Surface:* `lore check --max-warnings 12 --fail-on warn`.
*Effort:* small. *Risk:* none. *Adoption unblocker.*

**A4. SARIF 2.1.0 output.**
*Prior art:* [okfcli](https://github.com/okfcli/okf#commands), [ODS](https://github.com/open-doc-spec/ods) (verified emitting valid SARIF with populated results, exit 1).
*Surface:* `lore check --format sarif --exit-zero`.
*Effort:* small once A2 lands (SARIF wants stable rule IDs). *Risk:* none.

**A5. Machine-readable command self-description.**
*What:* one call returns every command, flag, arg, output kind, and exit code.
*Prior art:* [okfcli](https://github.com/okfcli/okf#commands) `okf schema [command]`.
*Surface:* `lore schema --surface` (or `lore schema commands`), inside the existing `{schemaVersion, kind, data}` envelope with `kind: "command-surface"`.
*Effort:* small if the arg parser is introspectable. *Risk:* none.
*Value to an agent is disproportionate: it collapses discovery from N `--help` calls to one, and it makes the generated SKILL.md derivable rather than hand-maintained.*

**A6. Determinism as a shipped test.**
*Prior art:* [okf-rs](https://github.com/jyjeanne/okf-rs) `generate --check-determinism`; [okf-ingest](https://github.com/travisjakel/okf-ingest) parity harness (verified: 3 runs, identical sha1).
*Surface:* `lore check --determinism` re-runs the pipeline and byte-diffs; a CI job asserting it, with a **negative control** proving the job can fail.
*Effort:* small-medium (requires purging map iteration order, timestamps, and locale from all output). *Risk:* none.

**A7. Explicit conformance statement + `lore conformance`.**
*What:* a document and a command that state exactly where lore diverges from [SPEC §11](https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md) — registered types with per-type schemas (§4.1 forbids a type registry), broken links as errors (§11 says consumers MUST NOT reject), unknown-key handling — and why the divergence is producer-side.
*Prior art:* [gsemet/okf-schema](https://github.com/gsemet/okf-schema#what-okf-schema-adds-to-okf)'s IMPORTANT block, which quotes the spec against itself.
*Surface:* `lore conformance --json` emitting each divergence with a rule ID and a rationale.
*Effort:* small. *Risk:* none. *This is reputational hygiene, and it is cheap.*

**A8. Ranked, budgeted `lore context`.**
*What:* rank the returned neighbourhood by **exact** Personalized PageRank over the author-written link graph (deterministic linear algebra, no model), with `--rank bfs` for plain depth and a hard token budget.
*Prior art:* [okf-ingest](https://github.com/travisjakel/okf-ingest) (`--rank ppr`, exactness locked by a cross-language conformance suite); [ODS](https://github.com/open-doc-spec/ods) bounded reading list + `ods bench` token ROI.
*Surface:* `lore context <id> --rank ppr|bfs --budget 8000 --depth N`; report the achieved token count in the envelope.
*Effort:* medium (PPR is ~100 lines; the budget needs a tokenizer decision — pick one and pin it, or count bytes/chars and say so).
*Risk to determinism:* **none if PPR is computed to a fixed iteration count or exact solve with a documented tie-break.** Floating-point tie-breaking is the only hazard; fix it with a stable secondary sort on concept ID.
*Highest value of any additive feature — this is the verb an agent actually calls.*

**A9. Task↔doc referential integrity, both directions, as a named gate.**
*What:* make it explicit and rule-ID'd that `lore check` fails when a Backlog task's `documentation[]` names a nonexistent doc, when a `doc:<id>` label points at no concept, and when a Story claims a task that does not exist.
*Prior art:* nobody. This is lore's own ground, and Backlog.md's verified `--doc docs/nope.md` → exit 0 is the hole it plugs.
*Surface:* rule IDs `lore/task/doc-missing`, `lore/task/label-dangling`, `lore/story/task-missing`; `lore tasks --check`.
*Effort:* small (probably mostly built). *Risk:* none.
*Ranked here rather than first only because it is likely partly shipped; if it is not shipped, move it to #1.*

**A10. Packaged CI surface: composite GitHub Action + `lore setup --git-hooks`.**
*Prior art:* [scaccogatto](https://github.com/scaccogatto/okf-skills) (`uses: scaccogatto/okf-skills@v1`, usable in repos with no agent), [ODS](https://github.com/open-doc-spec/ods) Marketplace action, [okf-rs](https://github.com/jyjeanne/okf-rs) PR-review action.
*Surface:* `lore setup --git-hooks`; a published action wrapping `lore check`, taking `bundle`/`fail-on`/`max-warnings`/`as-of`. **The action's final command must be unpiped** so a nonzero exit fails the job — ODS gets this right and it is easy to get wrong.
*Effort:* small. *Risk:* none.

**A11. `lore adopt <dir>` and `lore migrate`.**
*Prior art:* [ODS](https://github.com/open-doc-spec/ods) `ods adopt` (drafts frontmatter as `status: draft`); [scaccogatto](https://github.com/scaccogatto/okf-skills) `--migrate` (v0.1→v0.2, `# Citations` → `sources:`).
*Surface:* `lore adopt docs/legacy --dry-run` emitting a JSON plan; `lore migrate --from 0.1`.
*Effort:* medium. *Risk:* none if `--dry-run` is the default and the plan is a printed diff.
*This is pure funnel: it is how a repo with existing docs becomes a lore repo.*

**A12. Reviewer-facing impact report + merge gate.**
*Prior art:* [okf-rs](https://github.com/jyjeanne/okf-rs) `review <ref-a> <ref-b> --fail-on-risk` (verified: exit 1 with the flag, 0 without; sticky-comment marker; working tree untouched).
*Surface:* `lore impact --since <ref> --format review --fail-on-risk N`.
*Effort:* medium. *Risk:* none.
*Steal okf-rs's framing too — "being wrong in public": because the bundle **is** the artifact rather than a binary index, a mis-resolved edge shows up as a red line in a PR diff to a reviewer who has never run the tool. That is the strongest argument for lore's file-first design and lore is not currently making it.*

**A13. Never store derived values.**
*What:* confirm lore computes trust tier and staleness at render/query time and stores neither.
*Prior art:* [scaccogatto](https://github.com/scaccogatto/okf-skills)'s rationale — "a stored tier is a stored opinion, and it goes stale" — which matches SPEC's DERIVED trust tiers being explicitly never-stored.
*Effort:* audit only. *Risk:* none. *Free correctness.*

### ADOPT BEHIND A FLAG

**B1. MCP server — opt-in, read-only by default.**
*What:* `lore mcp` exposing the read verbs, with an explicit mode.
*Prior art:* [Foam](https://github.com/foambubble/foam/blob/main/packages/foam-mcp/README.md) (required `mode: 'read' | 'read-write'`, typed error codes: `resource_not_found`, `ambiguous_identifier`, `resource_exists`, `invalid_input`, `io_error`), [okf-mcp](https://github.com/travisjakel/okf-mcp#tools) (`okf_diff`/`okf_refresh` framed as "an agent's memory-refresh between looks"; read-only SELECT enforced at `registry.py:169`), [okf-gem](https://github.com/serradura/okf-gem) (output schemas), [zetl](https://codeberg.org/anuna/zetl) (scoped user-signed JWTs via `zetl delegate --tools ... --expiry 7d`).
*Surface:* `lore mcp --mode read` default; `--allow-writes` explicit; every tool carries an output schema and a behavior hint.
*Effort:* large. *Risk to determinism:* none — MCP is transport.
*Why behind a flag:* it is a long-running process with filesystem watching, which is a different failure model from a one-shot deterministic invocation, and [MCP errors are JSON-RPC codes, not process exit codes](https://modelcontextprotocol.io/specification/latest/server/resources) — so an MCP-first design would silently forfeit lore's CI-gate story. Ship the CLI as the contract and MCP as a projection of it. Also note MCP's change signalling is a payload-free ping with no diff, so `lore changed`/`snapshot` must be exposed as tools or the server is strictly worse than the CLI.

**B2. Blast-radius write guards on mutating commands.**
*What:* `replace`, `rename`, `supersede`, `sync`, and `link` must declare how much they may touch; validate everything before writing anything; abort naming the offenders.
*Prior art:* [iwe](https://github.com/iwe-org/iwe) `expect` guards (verified: exit 2 naming each document; mandatory over MCP); claude-obsidian's plan/approve/apply gated on `approved_plan_sha256` bound to the vault root, with journaling, locking, and recovery (prior pass, **unverified here**).
*Surface:* `lore replace <a> <b> --expect-docs 4`; guards **mandatory** whenever B1's `--allow-writes` is on.
*Effort:* medium. *Risk:* none — deterministic, and it makes agent writes auditable.
*Flagged only because making guards mandatory on the CLI immediately would break existing scripts; make them opt-in on the CLI, mandatory over MCP.*

**B3. Semantic search — strictly optional, strictly non-gating.**
*Prior art:* [okf-rs](https://github.com/jyjeanne/okf-rs) `search --semantic` (any OpenAI-compatible `/embeddings`), [okf-ingest](https://github.com/travisjakel/okf-ingest) `embed`/`rag` via local Ollama — **explicitly outside its deterministic core**, [zetl](https://codeberg.org/anuna/zetl) `--features semantic`; the best model is claude-obsidian's BM25 floor with optional local cosine rerank that falls back **totally and deterministically** (prior pass, unverified).
*Surface:* `lore query --semantic` only; never reachable from `check`, `validate`, or any exit-code-bearing gate; absent embeddings, silently returns the lexical result.
*Effort:* medium. *Risk to determinism:* **real, and this is the one item that carries it.** Mitigation is architectural, not procedural: the deterministic lexical result must be the *floor* that a rerank permutes, never a fallback path that can fail differently. If that invariant cannot be held, reject.

**B4. Watch mode / LSP.**
*Prior art:* [iwe](https://github.com/iwe-org/iwe) LSP for VS Code/Neovim/Zed/Helix; [ODS](https://github.com/open-doc-spec/ods) `ods lsp` + FS-watcher daemon; [Foam](https://github.com/foambubble/foam) chokidar.
*Effort:* large. *Risk:* none to determinism; large to scope. Lowest priority here — deliberately deferred is a fine answer.

**B5. Multi-bundle registry.**
*Prior art:* [okf-gem](https://github.com/serradura/okf-gem) — `okf registry set ./docs` then `@docs` works from any directory, and a bare `okf server` hosts every registered bundle.
*Effort:* medium. *Risk:* none, except that a per-user registry is machine state outside the repo, which cuts against repo-residency. Flag it, default off.

### REJECT

| Reject | Why |
|---|---|
| **Any LLM in the core** — enrichment, authoring, extraction | The whole thesis. [openwiki](https://github.com/langchain-ai/openwiki) needs one of 12 providers; the [GCP reference agent](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)'s only two verbs are `enrich` and `visualize`; [Kiro](https://kiro.dev/docs/specs/) requires an AWS account; [task-master](https://github.com/eyaltoledano/claude-task-master)'s `parse-prd`/`add-task`/`expand` all require API keys. If lore adds one, it loses the only axis on which it beats a 14,956-star competitor. |
| **Telemetry** | [openknowledge/okn](https://github.com/openknowledge-sh/openknowledge) has telemetry **on by default** (`--no-telemetry` opts out). That is a hard differentiator handed to lore for free; do not surrender it. [Mnemosyne](https://github.com/mnemosyne-oss/mnemosyne)'s "zero tracking, zero analytics, zero cloud dependency" is the line to match. |
| **Becoming a task tracker** | lore *couples*; [Backlog.md](https://github.com/MrLesk/Backlog.md) *owns*. Duplicating task state creates two sources of truth and destroys the one thing lore is uniquely good at. |
| **Forking OKF into a lore-native spec** | [ODS](https://github.com/open-doc-spec/ods) already occupies the rival-spec slot and has 4 stars for its trouble. Interoperate; diverge only as a **declared** strict superset (A7). |
| **Storing derived trust tiers or computed staleness** | SPEC marks trust tiers DERIVED and never-stored; [scaccogatto](https://github.com/scaccogatto/okf-skills) computes them at render time on principle. |
| **A hosted anything** | [mem0's MCP is hosted-only](https://github.com/mem0ai/mem0/blob/main/docs/migration/oss-v2-to-v3.mdx) — "Nothing runs on your machine". [Tessl](https://registry.npmjs.org/@tessl/cli) is a downloader stub for a proprietary binary and could not be inspected at all, which is itself the finding. Repo-residency is the product. |
| **Bi-temporal graph with contradiction-driven edge invalidation** | [Graphiti](https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/maintenance/edge_operations.py) is the state of the art and its invalidation algorithm is **two LLM calls deep** (`dedupe_edges` prompt for contradiction detection, a second call for timestamp extraction). The deterministic cousin — [Mnemosyne's uni-temporal `valid_from`/`valid_until` with `as_of` point-in-time query](https://github.com/mnemosyne-oss/mnemosyne/blob/main/mnemosyne/core/triples.py) — is borrowable, but git already gives lore transaction time via `snapshot`/`changed`, and OKF gives it `status` + `stale_after` for valid time. Adding a second temporal model is scope with no consumer. |
| **A viewer as a primary investment** | [Quartz](https://github.com/jackyzha0/quartz) (12,996★) is a publishing pipeline where the graph exists only as a rendered component with nothing to query from a terminal. [openwiki's `visualize`](https://github.com/langchain-ai/openwiki) loads its libraries from a public CDN, so it is not even offline. lore has `explorer`; cap the investment there. If HTML export happens, it must be **one self-contained file with no CDN** ([okf-gem `okf render`](https://github.com/serradura/okf-gem) is the model). |
| **Chasing star-count features** | [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) has 51,829 stars and a three-command CLI with no validator, no JSON, no exit-code contract. [spec-kit](https://github.com/github/spec-kit) has 126,484 stars and its "analyze" is a prompt. Stars in this field measure distribution, not machinery. |
| **Treating llms.txt or AGENTS.md as rivals** | [llms.txt explicitly rejects YAML frontmatter](https://llmstxt.org/) — no type, no trust family, no graph. `okn export html` writes one *into* its bundle. [okf-rs `init`](https://github.com/jyjeanne/okf-rs) writes AGENTS.md and makes CLAUDE.md a one-line `@AGENTS.md` import. Both are export targets. |

---

## 5. What lore should deliberately NOT do

1. **Do not let `check` depend on wall-clock time.** Everything else in this document is a feature; this is a correctness bug. A gate that passes today and fails tomorrow with no commit in between is not deterministic, and OKF's `stale_after` makes it easy to introduce accidentally. Fix with A1 before adding anything.

2. **Do not ship MCP as the primary interface.** [MCP errors are JSON-RPC `-32602`/`-32603`, not process exit codes](https://modelcontextprotocol.io/specification/latest/server/resources), and its change signal is a payload-free ping. An MCP-first lore forfeits CI gating — the capability that separates it from [Cline Memory Bank](https://docs.cline.bot/best-practices/memory-bank).

3. **Do not put semantic search anywhere near a gate.** Even offline embeddings drift across model versions and hardware. Keep `lore query` lexical, keep it the floor, and never let a rerank change a pass/fail.

4. **Do not silently out-strict the spec.** Two of the three ecosystem validators treat broken links as warnings ([okf-gem](https://okfgem.com/docs/cli/validate/): "Do not expect broken links to fail validation. They are warnings by design"; [scaccogatto](https://github.com/scaccogatto/okf-skills): fatal only under `--strict`); one ([okfcli](https://github.com/okfcli/okf#commands)) makes them exit 1. lore is on the strict side and has an *undeclared* type registry on top of that. Declare both, or a conformance-minded consumer will discover it and be right to be annoyed.

5. **Do not write the ODS question off.** [ODS's published framing](https://raw.githubusercontent.com/open-doc-spec/ods/main/docs/other-specs/frontmatter-keys-ods-vs-okf.md) — OKF for data/knowledge assets, ODS for software systems — is a direct argument that lore is applying the wrong spec to a code repo. It deserves a written answer, not silence. The honest counter is probably that lore's concepts (ADR, Spec, Runbook, Story) are *decisions about* a system rather than *descriptions of* it, and that OKF's trust/staleness/provenance families are exactly right for decisions that rot. Make that argument explicitly.

6. **Do not build a curated-list gate.** A hand-enumerated file list in CI is satisfiable while the rule it enforces is violated, and a green gate reads as proof. Any lore gate must enumerate by pattern, assert non-vacuity, report an unpiped exit code, and be proven by a negative control that makes it fail and names the offending path.

7. **Do not duplicate what git already does.** [iwe settles this by delegation](https://github.com/iwe-org/iwe): "because it's markdown in git… diff what changed, git-blame when." lore's `snapshot`/`changed`/`provenance` should add OKF *semantics* over git, never re-implement history. Note the trap ODS fell into: [`ods diff` is a 34-line `git diff --name-status` passthrough that always returns exit 0](https://github.com/open-doc-spec/ods/blob/main/src/ods-cli/src/main/commands/diff_command.rs) while its own help text claims it "compares document graph changes" — and the survey initially believed the help text. Make sure `lore changed` actually reads frontmatter and edges, and that its help text claims only what it does.

8. **Do not sell determinism as the differentiator.** Nine surveyed tools are deterministic. Sell **task coupling with referential integrity** and let determinism be the reason it can be trusted.

---

## 6. Coverage caveats

Blunt, and long, because the gaps matter more than the findings.

### Structural gaps in the data I was given

- **The survey payload is truncated.** The [Quartz v4](https://github.com/jackyzha0/quartz) entry is cut off mid-sentence ("Graph view, backlinks, explorer, breadcrumbs, popover previews, and full-text search are all site c…"). The `pkm-graph` category may contain further entries I never saw. Anything the payload would have said after that point is absent from this analysis.
- **The adversarial verdict list is also truncated**, mid-word, inside ODS's `typed_schema_validation` caveat ("the generated schema declares `depends` as array, `descript…"). I do not know how many verdicts existed beyond the four visible ones, nor whether any of them refuted a cell I have relied on above.
- **Only four rows were adversarially verified**: okf-ingest, okf-rs, iwe, ODS. **Everything else is single-pass survey data.** In particular the two tools that most threaten lore's differentiation claims — [okfcli/okf](https://github.com/okfcli/okf) (closest structural analogue, already has SARIF and command self-description) and [zetl](https://codeberg.org/anuna/zetl) (deepest overall feature overlap: typed edges, CI gate, time travel, MCP, self-installing skill) — were **never verified against a shipped artifact**. If either has an authoring lifecycle or task coupling I did not see, differentiation claim #4 in section 2 collapses.
- **The one refutation found in four attempts was a 25% failure rate**, and it came from a tool's own help text. Extrapolating, roughly one in four unverified cells in this survey may be wrong in the tool's favor.

### Things asserted but never verified

- **lore itself.** Every claim about lore's 28 commands, exit codes, envelope, schema coverage, `check` semantics, `context` behavior, and Backlog coupling comes from the prompt. **Nothing about lore was executed or read from source.** Sections 2 and 3 are conditional on that description being accurate. In particular I do not know whether `lore context` ranks or budgets, whether `lore check` already gates task↔doc edges, whether findings carry IDs, or whether `check` is wall-clock dependent — the three items I ranked highest (A1, A8, A9) may be partly or wholly shipped.
- **claude-obsidian and basic-memory** come from a prior pass with no verification in this one. A1 (`--as-of`) and B2 (plan/approve/apply) rest entirely on that unverified prior pass.
- **[openknowledge/okn](https://github.com/openknowledge-sh/openknowledge)** has 9 of 13 cells `unknown`. Its 27-command surface is the broadest in the ecosystem and I cannot tell whether it gates links, traverses graphs, or couples to a tracker. It is the largest single unknown in the OKF CLI category.
- **[Tessl](https://registry.npmjs.org/@tessl/cli)** is uninspectable by construction — the npm package is a 17 KB installer stub that downloads a proprietary binary. No command surface, JSON envelope, or exit-code contract can be verified from primary sources. Treat every Tessl cell as unknown, permanently.
- **[Kiro](https://kiro.dev/docs/specs/)**: no JSON output mode, exit-code contract, or deterministic validator could be verified from public docs. Whether Kiro exposes an MCP *server* (as opposed to being a client) is unverified.
- **"No MCP server" claims for [spec-kit](https://github.com/github/spec-kit), [OpenSpec](https://github.com/Fission-AI/OpenSpec), and [BMAD](https://github.com/bmad-code-org/BMAD-METHOD)** rest on in-repo greps for the string `modelcontextprotocol`. A server implemented without that literal string would be missed. Absence-of-grep is not absence.
- **The [GCP knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) "no validator" finding** rests on a then-current scan of 405 repo paths in a repo created 2026-05-04 with 174 open issues and 30 discussions. A first-party validator could land in a week and would reset the entire OKF CLI category.
- **[Backlog.md](https://github.com/MrLesk/Backlog.md) was probed at 1.49.3; npm latest was 1.50.1.** The critical finding lore's differentiation leans on — `--doc docs/nope.md` accepted with exit 0 — may have been fixed in 1.50.x. **Re-verify before building marketing on it.**

### Whole categories absent from the survey

None of the following were surveyed, and several are direct competitors for parts of lore's surface:

- **ADR tooling** — `adr-tools`, `log4brains`, `adr-manager`, MADR. A glaring omission given lore ships an ADR concept type; these own the "ADR in a repo" mindshare outright.
- **Link checkers** — `lychee`, `markdown-link-check`, `mkdocs-linkcheck`. These are the incumbent answer to "gate broken links in CI" and are vastly more adopted than any OKF tool.
- **Prose/docs linters** — Vale, `markdownlint`, textlint, `remark-lint`.
- **Software catalogs** — Backstage `catalog-info.yaml` and TechDocs. This is a very large, typed, repo-resident entity catalog with schema validation and a graph, and its absence is the most significant category gap in this survey.
- **Architecture-as-code** — Structurizr DSL, C4, arc42.
- **Doc site generators** — MkDocs, Docusaurus, Antora, Sphinx.
- **RFC tooling**, **Confluence/Notion**, and **`.cursorrules`-family conventions** beyond AGENTS.md.

### Measurement and licensing caveats

- **Stars measure repo popularity, not format adoption.** Nothing here measures how many bundles exist, how many agents consume OKF, or whether any consumer relies on `stale_after` or Attested Computation. lore's uniquely-authorable AC type may have zero consumers.
- **Token-ROI numbers are self-reported.** ODS's "~95% saving" is measured by `ods bench`, ODS's own tool. No head-to-head context-quality benchmark exists in this data.
- **License fields are unreliable and matter if lore ever vendors code.** GitHub's API reports [okf-rs](https://github.com/jyjeanne/okf-rs) as Apache-2.0 while the repo is MIT OR Apache-2.0; [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) as NOASSERTION while LICENSE is MIT; [Foam](https://github.com/foambubble/foam) as NOASSERTION while the packages declare MIT; [MCP](https://modelcontextprotocol.io/specification/latest/server/resources) as NOASSERTION. Copyleft to watch: [zetl](https://codeberg.org/anuna/zetl) AGPL-3.0-or-later, [Logseq](https://github.com/logseq/logseq) AGPL-3.0, basic-memory AGPL-3.0. Not OSI-open: [task-master](https://github.com/eyaltoledano/claude-task-master) (MIT WITH Commons-Clause forbids selling), [Tessl](https://registry.npmjs.org/@tessl/cli) (proprietary).
- **Namespace collision:** "Mnemosyne" resolves to at least four unrelated projects; only [mnemosyne-oss/mnemosyne](https://github.com/mnemosyne-oss/mnemosyne) is materially active. Similar caution applies to unscoped `lore` and `quest` on npm, which are unrelated third-party packages.
- **No pricing, commercial-positioning, or hiring-signal analysis** was performed on any tool.
- **Every date, version, and star count here is a 2026-08-12/13 observation.** Six of the surveyed repos had activity on the survey date itself.
