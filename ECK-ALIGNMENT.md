# ECK ⇄ Lore — Joint Alignment Decision Record

> **Status:** ECK-side **Accepted** · Lore-side **Pending review**.
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

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D2 — Unified Bun/TS stack → **share libraries, not just contracts** (the headline)

**Decision.** ECK's new CLI + docs tooling adopt **Bun/TypeScript** (with `bun:sqlite` built-in for ECK's own state store). Because Lore's `core/` is already designed as a **reusable library that returns structured objects** (no printing, no `process.exit` — ADR-0004, design §2.1), ECK can **import Lore's modules directly** instead of reimplementing them.

- **Candidate shared packages** (extracted from Lore, consumed by both): the OKF core (`concept.ts` / `bundle.ts` / `links.ts` / `reconcile.ts` / `schema.ts`), the **Backlog adapter** (`adapters/backlog.ts`), and the **CLI contract layer** (`errors.ts` + `output.ts` — exit-code taxonomy + `{schemaVersion, kind, data}` envelope + output modes).
- **Ask of Lore:** structure the repo so `core/` + `adapters/backlog.ts` + `errors.ts`/`output.ts` are **importable as a package** (e.g. `@salient-data/lore-core`), versioned with the CLI. This is the single biggest dedup: one OKF implementation, one Backlog adapter, one CLI contract — shared by `lore` and `evolv-coder-kit`.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D3 — One CLI contract (exit codes + JSON envelope), from Lore's `errors.ts`/`output.ts`

**Decision.** Lore's contract is canonical and ECK adopts it verbatim: exit `0/2/3/4/5/6`, stdout `{schemaVersion, kind, data}`, stderr `{error_type, message, hint, input}`, output modes `--json > --plain > pretty` (`--plain` auto on non-TTY, `NO_COLOR` honored), stdout=data/stderr=diagnostics, bounded output. With D2, ECK **imports** this layer rather than re-deriving it — guaranteeing identical semantics across `lore` and `evolv-coder-kit`.

- **Ask of Lore:** keep `cli-contract.md` + the `kind` registry as the published spec for the shared package; `lore help --json` (lore-38) is the capability-manifest pattern ECK mirrors.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D4 — One Backlog.md integration, via the fork; ECK reuses Lore's adapter

**Decision.** Both tools consume the **Backlog.md `--json` fork** (`jeremy-newhouse/Backlog.md`) now; the upstream PR is the eventual convergence but is **not** blocking. ECK does **not** write a second parser or commit `backlog/` independently — **Lore stays the sole committer of `backlog/`** (ADR-0012), and ECK reuses Lore's `adapters/backlog.ts` (shared per D2).

- **Identity bridge:** **ECK `feature` (e.g. `ECK-DEV-119`) ≡ Lore `Story`** (with `tasks:` + status rollup) ≡ Backlog task/epic. ECK's SDD artifacts _are_ Lore concepts; ECK reaches Backlog only **through** Lore (ECK feature → Lore Story → Backlog task).
- **Ask of Lore:** publish `backlog-json-schema.md` + `backlog-cli-contract.md` as stable consumable specs; document the **git-ownership matrix** (Lore owns `backlog/` + `docs/` conventions + `.lore/`; ECK owns `.claude/` infra + its local state DB + `project-constants.md`). Land the upstream `--json` PR when ready so both can migrate off the fork together.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D5 — ECK adopts `lore` as its docs engine; retires its Python OKF tooling (~M3–M4)

**Decision.** `dev-scripts/okf/*` (stamp, index/log gen, frontmatter + link/anchor lint, templates) is superseded by Lore's `validate`/`sync`/`check`/`new` + the shared core (D2). ECK's `DOC_PLATFORM=lore` backend calls/imports `lore`; the Python scripts are deleted.

- **Parity checklist before ECK swaps:** stamp/derive the 5 OKF keys (`type/title/timestamp/tags/resource`); generate per-tree `index.md` **and** a **git-history-derived `log.md`** (confirm your `log.md` gen is git-history-derived — ECK's lists commits touching each folder); relative-link + heading-anchor check; tiered per-type frontmatter validation.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D6 — One frontmatter serializer + the union key set (incl. `resource`)

**Decision.** With D2, **only Lore's serializer** (`concept.ts`, gray-matter + byte-stable ADR-0011) writes frontmatter — ECK stops Python-stamping, eliminating the two-serializer churn-war class of bug. Key set = the union: `type, title, description, tags, summary, timestamp, resource, okf_version, status, tasks, specs, supersedes, superseded_by`.

- `resource` is **OKF-recommended** (the spec lists `title, description, resource, tags, timestamp`) — **add it to Lore's schema**; ECK adopts your `summary`/`okf_version`/coupling fields. Fix ONE canonical key order (ADR-0011); extend the byte-stable golden tests to the union set.
- Already aligned: both write `okf_version` **only** on the bundle root index. Agree the root-index filename/case (`index.md` vs ECK's `INDEX.md`) — **recommend `index.md`** to match Lore.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D7 — Agent-bridge + `.claude/` coexistence (namespacing + marker-delimited CLAUDE.md)

**Decision.** Both generate `.claude/skills/.../SKILL.md` + a CLAUDE.md nudge. Keep Lore's skill namespaced under `.claude/skills/lore/` (you do); both tools inject their CLAUDE.md nudge inside a **marker-delimited managed block** (your `<!-- lore:tasks -->` pattern; ECK already uses marker blocks in `CLAUDE.md`) so neither clobbers the other. ECK's docs skills (`technical-writer`, `doc-create`, `doc-publish`, `sync-context`, `architecture-docs`) **defer to `lore`**; your generated `SKILL.md` is the canonical "how to do docs" guide agents read.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D8 — Confluence: one path, owned by Lore

**Decision.** When Lore's one-way Confluence publish lands (M7/M8), ECK drops its own `confluence-publish`/`confluence-reconcile` skills and routes through `lore publish confluence`; ECK's skills become thin wrappers. ECK's existing `confluence-official` primitive (auth/format/storage-vs-ADF, provenance banner, idempotent hash cache) can inform your adapter.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D9 — State model: ECK's DB is a local cache; **git is the shared source of truth**

**Decision.** No conflict between ECK's state DB and Lore's git-files. ECK's DB (now `bun:sqlite`) is **per-machine, local, rebuildable** — machine project registry, install/catalog drift, sessions, worktrees, activity, prefs — **plus a cache/projection** of git-tracked state for cross-project dashboards. The **multi-developer source of truth is git**: Backlog tasks, Lore docs/Stories, `.lore/`. Your "no database, git is the version store" stance (ADR-0013/0014) is exactly what validated this. ECK reads Lore's `query`/`graph`/`check`/`tasks` `--json` as its docs/coupling data source.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

## D10 — Housekeeping flags for the Lore session

- Your repo's `backlog/config.yml` has `check_active_branches: true` + `remote_operations: true`, but ADR-0012/the design say lore **sets these to `false`** in consumer repos. Dev-repo vs what-lore-configures? A one-line note avoids confusing integrators.
- `lore-spec.md` (v0.2) still shows the superseded `--plain` adapter + MCP-first framing; you flagged it in `lore-design.md`, but annotating the **spec body** would stop a spec-first reader following the dead path.

**ECK: ✅ Accepted** · **Lore: ⬜ Accept ⬜ Reject ⬜ Discuss** — _notes:_

---

## Summary

ECK and Lore independently converged on the same philosophy (OKF-native, deterministic, `--json`, non-interactive, git-as-truth, Backlog-coupled). Two decisions this round — **ECK on Bun/TS** and a **Backlog `--json` fork now** — upgrade the plan from "two aligned CLIs" to **"two CLIs on one stack sharing real libraries."** The highest-leverage moves: **D2** (share Lore's `core/` + Backlog adapter + CLI-contract layer as a package), **D1** (Title-Case, profile-driven OKF types), and **D4** (one Backlog integration) — after which **ECK adopts `lore` as its docs engine and deletes its Python OKF tooling (D5).**

_Open items the Lore session may want to weigh in on: the package boundary for the shared core (D2); whether `Epic`/`Story` stay Lore-only or join the shared profile (D1); the root-index filename (D6)._
