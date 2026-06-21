# ECK ⇄ Lore — Joint Alignment Decision Record

> **Status:** ECK-side **Accepted** · Lore-side **Reviewed (2026-06-21)** — **7 Accept · 3 Discuss · 0 Reject** (Discuss: D1, D2, D5). See the per-decision notes and the **Lore-side review summary** at the foot of this doc.
> This record was produced and **reviewed-and-accepted by the ECK (evolv-coder-kit) side**. The **Lore session** should review each decision and mark **Accept / Reject / Discuss** (with notes), then hand back to the ECK session to fold the accepted items into ECK's ADR-051 + design package.
> Per decision: **ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

---

## Context (ECK in a paragraph)

ECK is a Claude Code SDD framework (spec→design→develop→validate→deploy). Two facts make Lore unusually well-aligned: (1) **ECK-DEV's `docs/` is already a full OKF v0.1 bundle** with bespoke **Python** tooling (`dev-scripts/okf/`: stamp, index/log gen, frontmatter + link/anchor lint, a 17-type profile) that does _exactly_ Lore's `validate`/index-log/check/templates — Lore is the productized **superset**; and (2) ECK is mid-design on a **deterministic state CLI** (ADR-051) and is adopting **Backlog.md** as tracker + **Lore** as docs platform. **Two decisions made this round change the shape of the integration:** ECK's new CLI + docs tooling will be **Bun/TypeScript** (unifying with Lore + Backlog), and we are running a **fork of Backlog.md with `--json`** now (upstream PR pending). The result: ECK and Lore can **share real libraries**, not just conform to a contract. **North star: ECK adopts `lore` as its docs engine and deletes its Python OKF tooling.**

---

## D1 — OKF type vocabulary: **Title Case**, profile-driven, one shared profile

**Decision (researched against the OKF spec).** Use **Title Case** type values, and make Lore's type system **profile-driven** (the type set + per-type Zod schema + templates load from `.lore/`), shipping a "story convention" default and an ECK **SDD profile**.

- The [OKF v0.1 spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) does **not** mandate a case, but **every example it gives is Title Case** — `BigQuery Table`, `API Endpoint`, `Metric`, `Playbook`, `Reference`. Lore's capitalized types already match this; **ECK's lowercase (`adr`, `spec`, `design`, `qa-plan`) is the outlier.** OKF: type values are _not_ registered centrally; producers choose, consumers tolerate unknowns.
- **ECK conforms:** ECK re-stamps its 17 types to Title Case as part of adopting Lore — `ADR, PRD, FRD, Spec, Design, Discovery, Research, Risk, QA Plan, Tasks, Review, Guide, Reference, Overview, Template, Bug, Policy`. The shared profile is the **Title-Case union** of these + Lore's `Epic / Story / Runbook` (Spec/ADR/Reference overlap).
- **Ask of Lore:** make the vocabulary + per-type schemas loadable from `.lore/` config (you already load `.lore/schemas/*` + templates — extend to a swappable **profile**), so ECK's SDD profile drops in alongside the story profile. Keep OKF §unknown-type tolerance (warning, not error).
- Derivation note: ECK pre-stamps explicit `type:` (and will create docs via `lore new <Type>`), so Lore needs no path-derivation — it just needs to accept the SDD profile's types.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ✅ Discuss** — _notes:_ Title Case + warn-not-error unknown types already match (ADR-0003 §2/§3, ADR-0006 §1) — accepting ECK's 17 types needs no change there. But profile-driven *loading* is NEW and in tension with ADR-0006: Zod-in-code is the **single source of truth**, `.lore/schemas/*` are *emitted* (`z.toJSONSchema`), never loaded, and "hand-author JSON Schema" was an explicitly rejected alternative. Zod→JSON-Schema isn't 1:1, so ECK types with required-section/cross-field rules can't be fully expressed as loadable data — code-level Zod refinements remain. **Acceptable only via an ADR-0006 amendment** (profile loader under the ADR-0013 `.lore/` dir; Zod stays the validator; keep warn-not-error, ISO timestamps, byte-stable round-trip, tiered strict/lenient + `z.toJSONSchema` emission). **Open:** do Epic/Story join the shared union, and are types declarative data or code-refined?

## D2 — Unified Bun/TS stack → **share libraries, not just contracts** (the headline)

**Decision.** ECK's new CLI + docs tooling adopt **Bun/TypeScript** (with `bun:sqlite` built-in for ECK's own state store). Because Lore's `core/` is already designed as a **reusable library that returns structured objects** (no printing, no `process.exit` — ADR-0004, design §2.1), ECK can **import Lore's modules directly** instead of reimplementing them.

- **Candidate shared packages** (extracted from Lore, consumed by both): the OKF core (`concept.ts` / `bundle.ts` / `links.ts` / `reconcile.ts` / `schema.ts`), the **Backlog adapter** (`adapters/backlog.ts`), and the **CLI contract layer** (`errors.ts` + `output.ts` — exit-code taxonomy + `{schemaVersion, kind, data}` envelope + output modes).
- **Ask of Lore:** structure the repo so `core/` + `adapters/backlog.ts` + `errors.ts`/`output.ts` are **importable as a package** (e.g. `@salient-data/lore-core`), versioned with the CLI. This is the single biggest dedup: one OKF implementation, one Backlog adapter, one CLI contract — shared by `lore` and `evolv-coder-kit`.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ✅ Discuss** — _notes:_ Direction aligns — ADR-0004 §2 already mandates a reusable, structured-object core (no print/`process.exit`); ADR-0014 determinism is inherited — **no conflict**. But this is a **NEW distribution commitment**: ADR-0001 ships only the binary CLI (no exports map; `tsc --noEmit` per tech-stack §2; plain-JS publishing *explicitly rejected*), and design §2.1 calls core signatures "illustrative" — there is no SemVer'd TS API today. Discuss to (a) settle the **package boundary** (one `@salient-data/lore` + subpath exports vs a separate `@salient-data/lore-core`), (b) **extend ADR-0001** with a typed library artifact + build, and (c) **guard ADR-0012** — a second importer of `adapters/backlog.ts` *writes* must not become a second committer of `backlog/`. (ADR-0010 governs docs link form, not packaging — not real support here.)

## D3 — One CLI contract (exit codes + JSON envelope), from Lore's `errors.ts`/`output.ts`

**Decision.** Lore's contract is canonical and ECK adopts it verbatim: exit `0/2/3/4/5/6`, stdout `{schemaVersion, kind, data}`, stderr `{error_type, message, hint, input}`, output modes `--json > --plain > pretty` (`--plain` auto on non-TTY, `NO_COLOR` honored), stdout=data/stderr=diagnostics, bounded output. With D2, ECK **imports** this layer rather than re-deriving it — guaranteeing identical semantics across `lore` and `evolv-coder-kit`.

- **Ask of Lore:** keep `cli-contract.md` + the `kind` registry as the published spec for the shared package; `lore help --json` (lore-38) is the capability-manifest pattern ECK mirrors.

**ECK: ✅ Accepted** · **Lore: ✅ Accept ⬜ Reject ⬜ Discuss** — _notes:_ This is **ADR-0005 verbatim** (exit 0/2/3/4/5/6; `{schemaVersion,kind,data}`; `{error_type,message,hint,input}`; `--json>--plain>pretty`; NO_COLOR; bounded output) plus ADR-0004's CLI-as-primary discovery — already locked, **zero contract risk** (ADR-0004's no-import rule targets *consumer internals into core*, not publishing the contract). New asks: keep `cli-contract.md` + the §2.1 `kind` registry as the published spec, finish **LORE-38** (manifest is `kind: help.manifest`, specified in cli-surface.md), and bind ECK as a pinned downstream under ADR-0005 §7 additive-only versioning. The package *extraction* is **D2's**, not D3's.

## D4 — One Backlog.md integration, via the fork; ECK reuses Lore's adapter

**Decision.** Both tools consume the **Backlog.md `--json` fork** (`jeremy-newhouse/Backlog.md`) now; the upstream PR is the eventual convergence but is **not** blocking. ECK does **not** write a second parser or commit `backlog/` independently — **Lore stays the sole committer of `backlog/`** (ADR-0012), and ECK reuses Lore's `adapters/backlog.ts` (shared per D2).

- **Identity bridge:** **ECK `feature` (e.g. `ECK-DEV-119`) ≡ Lore `Story`** (with `tasks:` + status rollup) ≡ Backlog task/epic. ECK's SDD artifacts _are_ Lore concepts; ECK reaches Backlog only **through** Lore (ECK feature → Lore Story → Backlog task).
- **Ask of Lore:** publish `backlog-json-schema.md` + `backlog-cli-contract.md` as stable consumable specs; document the **git-ownership matrix** (Lore owns `backlog/` + `docs/` conventions + `.lore/`; ECK owns `.claude/` infra + its local state DB + `project-constants.md`). Land the upstream `--json` PR when ready so both can migrate off the fork together.

**ECK: ✅ Accepted** · **Lore: ✅ Accept ⬜ Reject ⬜ Discuss** — _notes:_ Restates locked direction: fork-now/upstream-eventual (ADR-0002, alt-5 rejected), Lore **sole committer of `backlog/`** with no second parser (ADR-0012 key 1; ADR-0002 single adapter), ECK reaching Backlog only via `src/adapters/backlog.ts`. New asks well-scoped: stabilize `backlog-json-schema.md` + `backlog-cli-contract.md` as a versioned external contract and publish a git-ownership matrix (extends ADR-0012). **Open (deferred by D4, not a conflict):** the bridge writes "Story ≡ Backlog task/epic," but **ADR-0009 makes a Story 1:N** over a `tasks:` list with a status rollup; "epic" maps to Backlog `parentTaskId`/subtasks (un-modeled in ADR-0009); and `ECK-DEV-119` IDs need a mapping layer to Backlog `task-N` IDs. **Resolve the cardinality against ADR-0009 before publishing the shared identity profile.**

## D5 — ECK adopts `lore` as its docs engine; retires its Python OKF tooling (~M3–M4)

**Decision.** `dev-scripts/okf/*` (stamp, index/log gen, frontmatter + link/anchor lint, templates) is superseded by Lore's `validate`/`sync`/`check`/`new` + the shared core (D2). ECK's `DOC_PLATFORM=lore` backend calls/imports `lore`; the Python scripts are deleted.

- **Parity checklist before ECK swaps:** stamp/derive the 5 OKF keys (`type/title/timestamp/tags/resource`); generate per-tree `index.md` **and** a **git-history-derived `log.md`** (confirm your `log.md` gen is git-history-derived — ECK's lists commits touching each folder); relative-link + heading-anchor check; tiered per-type frontmatter validation.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ✅ Discuss** — _notes:_ Four of five parity items are already locked direction — 5-key stamp (ADR-0003/0006, LORE-18), per-tree `index.md` (LORE-29), link+anchor check (ADR-0007/0010, LORE-30), tiered validation (ADR-0007, LORE-19); no ADR conflict. **Discuss the fifth:** `log.md`'s git-history derivation is **not specified anywhere** in Lore — ADR-0003/okf-conformance only *reserve* the file, design §3.4 regenerates it without a source, and §7 routes supersession into documents "not in a separate ledger." Settle `log.md` semantics in **LORE-29**; if git-history-derived (per-folder commit list, as ECK does), add it as a §8-style **injectable, sorted, byte-stable seam** to respect ADR-0014. **Caveat:** default `lore new` stamps `type/title/description/tags/summary/timestamp` and **omits `resource`** (OKF-recommended/supported, not default-stamped) — don't assume byte-parity on the stamped key set (see D6).

## D6 — One frontmatter serializer + the union key set (incl. `resource`)

**Decision.** With D2, **only Lore's serializer** (`concept.ts`, gray-matter + byte-stable ADR-0011) writes frontmatter — ECK stops Python-stamping, eliminating the two-serializer churn-war class of bug. Key set = the union: `type, title, description, tags, summary, timestamp, resource, okf_version, status, tasks, specs, supersedes, superseded_by`.

- `resource` is **OKF-recommended** (the spec lists `title, description, resource, tags, timestamp`) — **add it to Lore's schema**; ECK adopts your `summary`/`okf_version`/coupling fields. Fix ONE canonical key order (ADR-0011); extend the byte-stable golden tests to the union set.
- Already aligned: both write `okf_version` **only** on the bundle root index. Agree the root-index filename/case (`index.md` vs ECK's `INDEX.md`) — **recommend `index.md`** to match Lore.

**ECK: ✅ Accepted** · **Lore: ✅ Accept ⬜ Reject ⬜ Discuss** — _notes:_ `resource` is OKF-recommended (ADR-0003; ADR-0006 line 20) but not in ADR-0006's Base Zod sketch — adding it *optional* is purely **additive** (today it round-trips as an unknown key per ADR-0011 §5). `index.md` root + `okf_version`-on-root-only already match (ADR-0003 §1). **Critical (ADR-0011 §3 + Alternatives):** "fix ONE canonical key order" must **not** be a global sort over the union set — ADR-0011 rejects key-sorting and treats an author's existing order as *content*; the only conformant reading is a defined append-**slot** for lore-written keys on files lore writes. Extend ADR-0011 §8 golden + mutation fixtures to the union set incl. `resource`. No new ADR (extends ADR-0006/0011). (No `src/schema.ts` exists yet — work lands when it's first authored.)

## D7 — Agent-bridge + `.claude/` coexistence (namespacing + marker-delimited CLAUDE.md)

**Decision.** Both generate `.claude/skills/.../SKILL.md` + a CLAUDE.md nudge. Keep Lore's skill namespaced under `.claude/skills/lore/` (you do); both tools inject their CLAUDE.md nudge inside a **marker-delimited managed block** (your `<!-- lore:tasks -->` pattern; ECK already uses marker blocks in `CLAUDE.md`) so neither clobbers the other. ECK's docs skills (`technical-writer`, `doc-create`, `doc-publish`, `sync-context`, `architecture-docs`) **defer to `lore`**; your generated `SKILL.md` is the canonical "how to do docs" guide agents read.

**ECK: ✅ Accepted** · **Lore: ✅ Accept ⬜ Reject ⬜ Discuss** — _notes:_ ADR-0004 §3 + `lore agents` (LORE-36) already ship the namespaced `.claude/skills/lore/SKILL.md` + a tiny CLAUDE.md nudge, idempotent with `lore agents --check` as the drift gate; co-existence rides **ADR-0008 boundary safety** (lore edits only inside its own markers, which protects ECK's blocks symmetrically). **Load-bearing clarification:** do **not** reuse the reserved `lore:tasks` marker (that's the task-table region — single balanced pair or **exit 6**); use a **distinct `lore:agents`** marker. Net-new (adopt, don't assume shipped): route the nudge through `managed-block.ts`'s locate/replace/frozen-serialize discipline gated by `lore agents --check`, and document the co-existence contract in agent-onboarding.md. ECK docs skills deferring to Lore's SKILL.md reinforces ADR-0004 at zero cost.

## D8 — Confluence: one path, owned by Lore

**Decision.** When Lore's one-way Confluence publish lands (M7/M8), ECK drops its own `confluence-publish`/`confluence-reconcile` skills and routes through `lore publish confluence`; ECK's skills become thin wrappers. ECK's existing `confluence-official` primitive (auth/format/storage-vs-ADF, provenance banner, idempotent hash cache) can inform your adapter.

**ECK: ✅ Accepted** · **Lore: ✅ Accept ⬜ Reject ⬜ Discuss** — _notes:_ ECK routing through `lore publish confluence` and demoting its skills to thin wrappers is the intended consumer pattern (ADR-0004, thin shell over reusable core); one-way only preserves repo-as-source-of-truth (ADR-0016 §1, ADR-0002). Verified: ADR-0016 §3 names this exact isolated adapter, §2 Cloud/ADF, §4 hash-cache idempotency, §5 provenance banner — all match ECK's `confluence-official` primitive (welcome design input, no obligation). No new Lore work beyond shipping ADR-0016 (**LORE-43 → LORE-44**, both deferred/LOW). **Caveat (ECK-side sequencing, not a conflict):** don't deprecate `confluence-reconcile` until Lore's publish is delivered *and verified* — and since ADR-0016 makes round-trip a **permanent non-goal**, dropping reconcile permanently forecloses any Confluence→repo path.

## D9 — State model: ECK's DB is a local cache; **git is the shared source of truth**

**Decision.** No conflict between ECK's state DB and Lore's git-files. ECK's DB (now `bun:sqlite`) is **per-machine, local, rebuildable** — machine project registry, install/catalog drift, sessions, worktrees, activity, prefs — **plus a cache/projection** of git-tracked state for cross-project dashboards. The **multi-developer source of truth is git**: Backlog tasks, Lore docs/Stories, `.lore/`. Your "no database, git is the version store" stance (ADR-0013/0014) is exactly what validated this. ECK reads Lore's `query`/`graph`/`check`/`tasks` `--json` as its docs/coupling data source.

**ECK: ✅ Accepted** · **Lore: ✅ Accept ⬜ Reject ⬜ Discuss** — _notes:_ D9 **validates** rather than challenges Lore's locked stance: git is the version store / `.lore/cache/` is gitignored rebuildable scratch (ADR-0013), core is deterministic and serves agents structured `--json` ground truth (ADR-0014, verbatim at lines 70-76), retrieval is deterministic (ADR-0015). ECK's `bun:sqlite` DB is a per-machine rebuildable projection — same discipline as `.lore/cache/`, on the consumer side of the git-ownership line. Note: ADR-0015 rejects persisted SQLite as a second source of truth **for Lore's core only**; D9 stays clear because the DB is wholly ECK-side. No new commitment beyond keeping `query`/`check`/`tasks`/`graph` `--json` stable under the envelope (already the ADR-0005/0014 contract; `graph --json` already exists, cli-contract.md line 125).

## D10 — Housekeeping flags for the Lore session

- Your repo's `backlog/config.yml` has `check_active_branches: true` + `remote_operations: true`, but ADR-0012/the design say lore **sets these to `false`** in consumer repos. Dev-repo vs what-lore-configures? A one-line note avoids confusing integrators.
- `lore-spec.md` (v0.2) still shows the superseded `--plain` adapter + MCP-first framing; you flagged it in `lore-design.md`, but annotating the **spec body** would stop a spec-first reader following the dead path.

**ECK: ✅ Accepted** · **Lore: ✅ Accept ⬜ Reject ⬜ Discuss** — _notes:_ **Both items resolved on this branch.** **Item A (config drift):** real misconfig of the lore dev repo, not a dev-vs-consumer distinction — ADR-0012 mandates all three `false` in *every* lore-managed project, and the repo would fail `lore check`'s own **exit-6 drift gate**. Set `backlog/config.yml` `check_active_branches: false` + `remote_operations: false` (`auto_commit` already false) and added an inline note that the repo dogfoods its own coexistence contract. **Item B (stale spec):** inserted a **SUPERSEDED banner** directly under `lore-spec.md`'s H1 pointing to ADR-0002 (Backlog adapter is JSON-only via `--json`, not `--plain`) and ADR-0004 (CLI-first; MCP deferred) and to `docs/specs/lore-design.md`, leaving the v0.2 narrative intact with the banner governing precedence (and disambiguating lore's own `--plain` *output* mode from the dead `--plain` Backlog *input* adapter).

---

## Summary

ECK and Lore independently converged on the same philosophy (OKF-native, deterministic, `--json`, non-interactive, git-as-truth, Backlog-coupled). Two decisions this round — **ECK on Bun/TS** and a **Backlog `--json` fork now** — upgrade the plan from "two aligned CLIs" to **"two CLIs on one stack sharing real libraries."** The highest-leverage moves: **D2** (share Lore's `core/` + Backlog adapter + CLI-contract layer as a package), **D1** (Title-Case, profile-driven OKF types), and **D4** (one Backlog integration) — after which **ECK adopts `lore` as its docs engine and deletes its Python OKF tooling (D5).**

_Open items the Lore session may want to weigh in on: the package boundary for the shared core (D2); whether `Epic`/`Story` stay Lore-only or join the shared profile (D1); the root-index filename (D6)._

---

## Lore-side review summary (2026-06-21)

Reviewed each decision against Lore's 16 locked (Accepted) ADRs; every verdict was independently re-checked for locked-ADR conflicts. **No decision conflicts with a locked ADR** — the three `Discuss` calls are *new commitments / unspecified semantics to settle*, not rejections.

| # | Decision | Lore verdict | Why |
|---|----------|--------------|-----|
| D1 | Title-Case + profile-driven types | **Discuss** | Title Case + warn-not-error already match; **profile-driven *loading* is new** and needs an ADR-0006 amendment (Zod stays single source of truth; schemas are emitted, not loaded). |
| D2 | Share `@salient-data/lore-core` | **Discuss** | Direction aligns (ADR-0004/0014) but it's a **new distribution commitment** beyond ADR-0001 (binary-only today). Settle package boundary + extend ADR-0001. |
| D3 | One CLI contract layer | **Accept** | ADR-0005 verbatim + ADR-0004 discovery. Publish as spec; finish LORE-38. |
| D4 | One Backlog integration via fork | **Accept** | Restates ADR-0002/0012. **Resolve identity-bridge cardinality vs ADR-0009 (Story is 1:N) before publishing the shared profile.** |
| D5 | ECK adopts lore docs engine | **Discuss** | 4/5 parity items locked; **`log.md` git-history derivation is unspecified** — settle in LORE-29 (needs an ADR-0014-safe seam). |
| D6 | One serializer + union keys + `resource` | **Accept** | Additive; add `resource` to Base schema. **Caveat: no global key sort (ADR-0011 §3) — append-slot only.** |
| D7 | `.claude/` coexistence | **Accept** | ADR-0004 §3 + ADR-0008. **Use a distinct `lore:agents` marker, NOT the reserved `lore:tasks`.** |
| D8 | Confluence owned by Lore | **Accept** | ADR-0016, deferred M7/M8 (LORE-43/44). ECK deprecation gated on Lore delivery. |
| D9 | Git is the shared source of truth | **Accept** | Validates ADR-0013/0014/0015; ECK's `bun:sqlite` is a consumer-side projection. |
| D10 | Housekeeping | **Accept (resolved)** | Both fixes applied on this branch (config drift + spec banner). |

**Three things ECK should treat as gated before building on them:**
1. **D1** — the profile loader requires an **ADR-0006 amendment**; not all 17 per-type schemas can be pure loadable data (Zod→JSON-Schema isn't 1:1), so some ECK types will still need code-level refinements.
2. **D2** — the **shared-package boundary and a library-publishing extension to ADR-0001** must be decided before ECK can `import` Lore modules; ADR-0012 sole-committer must be preserved (the adapter must not give ECK a second write path into `backlog/`).
3. **D4** — the **identity bridge is not 1:1**: ADR-0009 makes a Lore Story own *many* Backlog tasks (with a status rollup). Lore must define `ECK feature → Lore Story (1:1) → Backlog tasks (1:N)` and the `ECK-DEV-119 ↔ task-N` ID mapping before ECK relies on the equivalence.

**Housekeeping (D10) — resolved on this branch:**
- `backlog/config.yml`: set `check_active_branches: false` and `remote_operations: false` to match ADR-0012 (the dev repo dogfoods its own coexistence contract; it would otherwise fail `lore check`'s exit-6 drift gate), with an inline note.
- `lore-spec.md`: added a SUPERSEDED banner under the H1 redirecting the `--plain` Backlog-adapter and MCP-first framing to ADR-0002, ADR-0004, and `docs/specs/lore-design.md`.

_Method note: verdicts produced by a fan-out review (one analyst per decision against the cited ADRs) with an independent adversarial verification pass per verdict._
