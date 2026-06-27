# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Graph-derived `index.md` generation — `core/indexes.ts`** (LORE-29). A pure
  `generateIndexes(g, { existing })` that regenerates every bundle `index.md` as a deterministic,
  byte-stable **navigable hub**: the reserved root entry point plus one local hub per
  concept-bearing directory (and its ancestors, so the tree links from the root down), each listing
  its immediate child concepts and child-directory indexes as portable, percent-encoded relative
  `.md` links sorted with `compareCodeUnits`. Index files are **hand-authored documents with one
  machine-owned region**: only the `<!-- lore:index:begin -->…<!-- lore:index:end -->` block is
  regenerated, **string-spliced into the file's raw bytes** so frontmatter, the root index's in-fence
  modeline, and all curated prose survive byte-for-byte (lore-design §6.2) — never round-tripped
  through `serializeConcept` (which would drop the modeline). The current on-disk bytes enter through
  an injected `existing` seam (the determinism boundary `log.ts` draws with `GitAdapter`), keeping
  core pure; a sub-index that does not yet exist is synthesized **frontmatter-free** (AC#2), and the
  root index's `okf_version`/creation stays `lore init`'s job. Splicing is a **fixpoint** — a
  no-change run is a byte-level no-op — so `index.md` stays trustworthy under `lore check`'s
  regenerate-and-compare drift gate (AC#1). Delivered as pure core + tests (`indexes.ts` 100%
  line/func); the `lore sync` wiring that reads/writes the files is LORE-26, the remark/mdast
  unification of all managed regions is LORE-22, and the temporary local path-segment encoder is
  swapped for `links.ts`'s shared `encodePathSegments` once LORE-28 lands on `dev`.
- **`GitAdapter` seam + git-history `log.md`, and `resource` stamping** (LORE-47). Two pieces of
  the ECK↔lore alignment (D5):
  - The **third injectable deterministic seam, `GitAdapter`** (after the clock and the Backlog
    subprocess — lore-design §8, ADR-0014), plus a pure `generateLog` that renders the bundle's
    `log.md` from commit history: per-folder, directory-sorted, commits sorted by
    `(timestamp, hash)`, so output is order-independent and **byte-stable**. git is local,
    deterministic computation over a **pinned commit range** — not a network model — so it stays
    offline-, air-gap-, and CI-reproducible. `core/log.ts` (interface + pure fn) is delivered and
    tested against a **fixed fake history** (never real `git`); the real `git`-shelling adapter and
    the `lore sync` wiring that materializes `log.md` land with `sync`. Because a git-derived
    `log.md` changes on every commit, it is a `sync`-time artifact **excluded** from `lore check`'s
    drift gate (ADR-0007 amended); `index.md` and managed blocks stay gated.
  - `lore new` now **stamps the OKF-recommended `resource` key** from the profile's
    `[profile].resource_base`: `resource = <resource_base>/<repo-relative doc path>`, exactly one
    join slash, each path segment URL-encoded (slugs unchanged; spaces/non-ASCII percent-escaped),
    `.md` kept. It is **opt-in and byte-safe**: an empty `resource_base` (the default) omits the key
    entirely, and index/sub-index files never carry it, so zero-config output is unchanged.
    `resource` is a recognized OKF key (`schema.ts` `OKF_RESERVED_KEYS`), not a profile field, so it
    raises no extra-key warning and changes no generated validator or committed schema (ADR-0013
    amended) — except on an `index.md`, where a hand-authored `resource:` *is* warned (an index
    carries none). Whether to stamp is decided **per-type**: a type that declares its own `resource`
    field defers only for *that* type, and a `resource = { required = true }` string field is
    satisfied by the stamp (not failed) — an incompatible `datetime`/`enum`/`list` field still
    defers. `lore validate` also gains an advisory **`resource` drift** warning: a present `resource`
    that no longer matches its path + `resource_base` is flagged stale (inert under zero-config).
- **Declarative `.lore/profile.toml` — the type system is now data, not code** (LORE-46). A
  committed, declarative profile is the single source of truth for the type vocabulary, each
  type's frontmatter shape, its required body sections, and its template; lore **generates** its
  runtime Zod validators *and* the editor Draft-7 JSON Schemas from it at load (inverting
  ADR-0006: declarative profile → generated Zod → `z.toJSONSchema`). The grammar (TOML, with a
  `.json` form) declares `[profile]` (name, okf_version, case, resource_base), `[base.fields]`
  (fields every type carries; `type` must be required), and `[[types]]` (name, `fields` with
  `kind`/`enum`/`items`/`required`/`default`, required `sections`, and a `template` ref). It is
  **zero-config**: absent — or every line commented — falls back to the built-in
  story-convention profile (Epic/Story/Spec/ADR/Runbook/Reference), so existing bundles behave
  byte-for-byte as before. A custom profile is read by the **standalone binary as data** — no
  code, no library; the declarative language is the boundary (no escape hatch). Two things stay
  lore built-ins (not declaratively expressible): the ADR-0006 §5 summary heuristic and the
  `supersedes`/`superseded_by` `string | list` coupling fields. A type's editor schema filename
  is its **LOWER-KEBAB slug** + `.schema.json` (`QA Plan` → `qa-plan.schema.json`); single-word
  story types are unchanged. `lore init` now scaffolds a commented `.lore/profile.toml`. The
  grammar is validated against ECK's 17-type SDD vocabulary with zero consumer-file edits.
  `src/core/profile.ts` owns loading + compiling; `schema.ts`/`concept.ts`/`validate.ts`/
  `scaffold.ts` and the commands thread the compiled `Profile` (ADR-0006/0007/0011/0013 amended).
- `lore validate [paths…]` (LORE-19): tiered, per-file conformance reporting. Unlike the
  fail-fast write path, validate is an **aggregating reporter** — it surfaces *every* file's
  findings in one pass, tiered error/warning, and emits a `kind: validate.report` payload on
  stdout, then **returns** exit `6` when any error-tier finding exists (or any warning under
  `--strict`); the report is the payload, the exit code is the gate signal. Tiers (ADR-0007):
  **OKF §9** (frontmatter parses, non-empty `type`) and **per-type shape** — the strict Zod
  schema **plus per-type required body sections** — are errors; an **unknown type / extra key /
  summary** issue is a warning (OKF tolerance: unknown types never fail, LORE-19 AC#1); and a
  cross-cutting **frontmatter quote-safety** check flags unquoted scalars a YAML-1.1 consumer
  would coerce (`yes`→bool, bare dates, leading `@`/`*`/… indicators, colon-space). Required
  sections follow a **minimal, evidence-based** policy (ADR → `Status`/`Context`/`Decision`/
  `Consequences`; Story → `Acceptance criteria`; others none) so the existing hand-authored
  bundle stays green while a fresh `lore new` of any type still validates clean. With no paths
  the whole `docs/` bundle is walked; explicit `[paths…]` (a file or directory) validate only
  those — the staged-only pre-commit run (AC#2). A non-concept file (no frontmatter) is
  **skipped**, not failed. Flags: `--type <T>` (limit to one type), `--strict` (warnings fail).
  `src/core/validate.ts` is the pure engine (`validateConceptText`/`validateFiles`/
  `quoteSafetyFindings`); `src/commands/validate.ts` the thin discovery/I/O layer. Required
  sections are a single source of truth in `schema.ts` (`requiredSectionsFor`); `walkMarkdown`
  is exported from `bundle.ts` for reuse.
- `lore new <type> "<title>"` (LORE-18): scaffold a typed concept from a template.
  lore **owns the frontmatter** — it is built structurally (type/title/summary/timestamp,
  plus `--tags`) and serialized through the byte-stable concept boundary, so a title or
  summary containing YAML-special characters can never corrupt the file — while the
  **template owns the body**: a body-only markdown skeleton with `{{placeholders}}`
  resolved from `.lore/templates/<name>.md` when present, else a built-in per type. New
  docs **validate clean by construction** (a known type, a stub `summary`, and the editor
  modeline spliced inside the fence) and a re-run never clobbers an existing file (a
  `conflict`, exit `5`). `src/core/template.ts` is the pure renderer (`slugify`,
  `renderTemplate`, `buildNewConcept`); `src/commands/new.ts` the thin I/O layer. Flags:
  `--var k=v` (repeatable; an unfilled `{{var}}` fails loud, exit `6`), `--template <name>`,
  `--summary`, `--tags a,b`, `--out <path>` (confined to the `docs/` bundle root, never the
  reserved `index.md`). The type token is validated (no path-escaping/whitespace), `--`
  ends option parsing (a dash-leading title), a value-taking flag won't swallow a following
  flag, and a user template is resolved case-insensitively. Unknown types are accepted (OKF
  tolerance) and scaffolded against the lenient shape without a modeline.
  Type config gains a per-type output directory (`typeDirectory`) and case-insensitive
  type resolution (`canonicalType`) in `schema.ts`; `DOCS_DIR` is exported from
  `scaffold.ts`; the never-clobber/conflict write path is factored to `src/commands/fswrite.ts`
  and shared with `lore init`. (Coupling flags `--epic`/`--story`/`--resource` deferred to
  the story-task coupling work, ADR-0009.)
- Concept frontmatter layer (LORE-15): `src/core/schema.ts` + `src/core/concept.ts` —
  the frontmatter boundary and Zod source of truth. `schema.ts` authors the
  story-convention profile (the six known types `Epic`/`Story`/`Spec`/`ADR`/`Runbook`/
  `Reference`) in Zod; `validateFrontmatter` enforces the OKF tiers — a missing `type`
  or a mistyped known field throws a `validation` `LoreError` (exit `6`), while an
  unknown type, an extra key on a known type, or a missing/over-long `summary` is a
  warning (OKF tolerance), recorded on a `WarningCollector` rather than printed.
  Validation never rewrites the data, and dates stay ISO **strings** (ADR-0006 §2).
  `concept.ts` turns a `.md` file into a typed `Concept {id, path, type, frontmatter,
  body}` (`parseConcept`) and back (`serializeConcept`) through one frozen
  gray-matter + js-yaml engine (`JSON_SCHEMA` keeps timestamps as strings; pinned dump
  options give deterministic block style, no wrapping, stable minimal quoting). Output
  is **byte-stable**: known keys emit in a fixed canonical order with unknown keys
  preserved verbatim, so re-serializing a canonical doc reproduces the exact bytes and
  the round-trip is a fixpoint (ADR-0011; golden + idempotency tests, design §9.2). A
  literal `__proto__` frontmatter key is preserved as data without prototype pollution.
  New runtime deps, version-pinned for serializer stability (ADR-0011): `gray-matter`,
  `js-yaml`, `zod`. JSON-Schema emission and the above-fence editor modeline are
  deferred to `lore init`/`lore new` (LORE-17), where they are consumed.
- Output-mode layer (LORE-12): `src/output.ts` — lore's single rendering seam.
  `resolveMode`/`resolveOutput` resolve one of three modes up front with the locked
  precedence `--json > --plain > pretty`; a non-TTY stdout auto-selects `--plain`
  (deterministic pipes without a flag) and `--json` always overrides (cli-contract §1).
  The returned `OutputContext` carries `mode` as the single routing key (plus the
  env-dependent `color`); `errorRenderOpts(ctx)` derives the `{ json, color }` pair
  `reportError`/`WarningCollector.flush` consume, so the success and error paths can't
  disagree and errors.ts keeps owning no TTY/mode logic. Color is enabled **only** in
  pretty mode with `NO_COLOR` unset (any value, including the empty string, suppresses;
  cli-contract §6). `successEnvelope` builds the additive-only
  `{ schemaVersion, kind, data }` success envelope (`SCHEMA_VERSION = 1`, §2). `emit`
  serializes the `--json` envelope **then validates those exact bytes** before writing,
  so a malformed/non-serializable payload (`undefined`/primitive/`Date`-like/`BigInt`/
  circular `data`, or a non-`object`/array result) throws with empty stdout (the "stdout
  parses or stays silent" invariant, §4) rather than emitting a lie at exit 0; pretty/
  plain output is normalized to exactly one trailing newline (an empty or whitespace-only
  body stays silent, significant trailing whitespace is preserved). `truncation`/
  `renderTruncationLine` provide explicit, count- and newline-guarded bounded-output
  hints (`showing 30 of 120 — narrow with …`, §3). Hardened across four `/code-review max`
  passes. Module + tests only; commands wire it in at M1 (matches the errors.ts/config.ts
  precedent). `errors.ts` additionally exports `singleLine`/`asText` (shared text
  discipline) used by the truncation hint.
- `.lore/config.toml` loader (LORE-10): `src/config.ts` — `loadConfig({ root?, env? })`
  parses the committed config with **Bun-native TOML** (no added dependency) into a
  typed, validated `LoreConfig` (`reconcile`, `validate`, `confluence`). Zero-config
  (a missing file yields the documented defaults), deterministic via injectable
  `root`/`env` seams, and snake_case TOML keys map to camelCase fields. The Confluence
  token is read **only** from `$LORE_CONFLUENCE_TOKEN` and is never persisted; a token
  committed under `[confluence]` fails loud. Malformed TOML or an out-of-contract value
  throws a `validation` `LoreError` (exit `6`); unknown keys/sections are tolerated for
  forward-compatibility. lore's own `.lore/config.toml` is committed; `.lore/cache/`
  stays gitignored (ADR-0013).
- Shared error model (LORE-11): `src/errors.ts` — the `LoreError` taxonomy and
  centralized semantic exit-code mapping (`0` ok, `2` usage, `3` not-found,
  `4` denied, `5` conflict, `6` validation/drift; `1` reserved for uncaught
  bugs), the `--json` `{error_type,message,hint,input}` error envelope rendered
  on stderr, and a warnings-not-errors `WarningCollector` (advisory warnings go
  to stderr and never change the exit code by themselves). Mode/color are caller
  inputs — the module resolves no TTY/`NO_COLOR` and never writes stdout
  (cli-contract §4–§5 / ADR-0005). The CLI wires this in at M1. The error path is
  crash-safe: the `--json` envelope serializes through a `safeStringify` fallback
  that tolerates a circular, `BigInt`-bearing, or throwing-`toJSON`/getter
  `LoreError.input` (true cycles → `[Circular]`, `BigInt` → decimal string, shared
  acyclic refs preserved, an individual unserializable field → `[Unserializable]`)
  while `error_type`/`message`/`hint` always survive; the safe path honors a
  custom `toJSON` (a `Date` → its ISO string), so it agrees with the fast path
  and respects a `toJSON` written to hide fields. The uncaught branch guards
  message derivation against a hostile `toString`/`Symbol.toPrimitive` and
  surfaces a thrown non-Error object's detail (its `message`, else a JSON
  projection, with an empty `message` honored as-is rather than dumping the
  object's other fields) instead of `"[object Object]"`. The envelope coerces
  `message`/`hint` to single-line strings, omits an empty `hint`, and echoes only
  a non-null, non-array object `input` (cli-contract §5.2).
  `WarningCollector.flush` is documented as non-draining, and `EXIT_CODES` is
  frozen.
- CI (LORE-8): GitHub Actions workflow running `lint`, `typecheck`, and
  `bun test --isolate` across Ubuntu/macOS/Windows (Windows tuned with
  `--max-concurrency=4` for stability), plus a Linux compile smoke. The Bun
  version is sourced from `.bun-version` (single source of truth). A
  `.gitattributes` pins text files to LF so the lint gate is stable on Windows.
- Dev tooling (LORE-7): Biome for lint + format (honoring `.editorconfig`) and the
  `bun test` harness with coverage (`bunfig.toml`, text + lcov reporters). Scripts:
  `format`, `lint`, `lint:fix`, `test`, `test:coverage`. (Biome was chosen over the
  task's original ESLint+Prettier to satisfy the *thin* and *match Backlog.md* rules.)
- Bun + TypeScript toolchain scaffold (LORE-6): `package.json` (`@salient-data/lore`,
  bin `lore`), strict `tsconfig.json`, Bun pinned to `1.2.23` (`.bun-version` +
  `packageManager`/`engines`) with rationale and bump procedure in `DEVELOPMENT.md`,
  and a stub `lore` CLI (`src/cli.ts`).
- Project bootstrap: repository, MIT license, `.gitignore`/`.editorconfig`, community files.
- Product specification (`lore-spec.md`) and the OKF documentation bundle under `docs/`
  (architecture, tech stack, design, ADRs, runbooks, references).
- Build plan tracked as Backlog.md milestones and tasks.

[Unreleased]: https://github.com/jeremy-newhouse/lore/commits/dev
