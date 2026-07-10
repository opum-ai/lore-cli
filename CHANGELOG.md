# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`lore orphans` — the bidirectional doc↔task coupling report** (LORE-32). Surfaces two kinds of
  gap in one pass: **orphan tasks** (a Backlog task no concept lists in its `tasks:` frontmatter and
  that carries no `doc:<conceptId>` back-reference label — work documented nowhere) and **dangling
  links** (a concept `tasks:` id the current-branch Backlog snapshot no longer knows — a doc pointing
  at a deleted/renamed task). It reads Backlog **once** (`task list --json`, all statuses) and derives
  both directions by set arithmetic against the loaded graph — no per-task probing. `--tasks-only` /
  `--docs-only` narrow the report to one side. Under `--json` it emits `kind: orphans.report` —
  `{ orphanTasks[], danglingLinks[] }` (object-wrapped for additive growth; the section a flag excludes
  is omitted, never emitted as an empty array, so `--docs-only --json` can't be misread as "no orphan
  tasks"). Backlog capability is probed up front (a missing binary exits `3`, a non-`--json` binary
  exits `6`); it is a **report, not a gate** — always exit `0` on success, even when the report is
  non-empty. Now advertised in `lore help`, the `lore help --json` manifest, and the generated agent
  bridge.
- **`lore tasks <id>` — a concept's live Backlog task rollup** (LORE-25). Loads the `docs/` bundle,
  resolves the concept, and prints each `tasks:`-linked task's **current** status pulled fresh from the
  Backlog JSON adapter — the read-only view of what `lore sync` materializes into the managed block,
  written nowhere. `--status <S>` filters to one Backlog status (case-insensitive). Under `--json` it
  emits `kind: tasks.rollup` — `{ concept, status?, tasks: [{ id, title, status }] }` (object-wrapped,
  like every list command, so the contract can grow additively). Backlog capability is probed up front
  (a missing binary exits `3`, a non-`--json` binary exits `6`), which lets a `tasks:` id Backlog no
  longer knows be dropped from the rollup with a stderr advisory (exit `0`) rather than mistaken for an
  outage; an `<id>` absent from the bundle exits `3`. Now advertised in `lore help`, the `lore help
  --json` manifest, and the generated agent bridge.
- **`lore help` — human help plus a machine-readable capability manifest** (LORE-38). `lore help`
  prints the command catalog and `lore help <command>` prints one command's detail (args, flags,
  output `kind`, exit codes, examples); an unknown command exits `3`. Under `--json` it emits
  `kind: help.manifest` — a curated manifest of every **shipped** command (name, summary, args,
  flags, `--json` availability, `kind`, exit codes, examples) plus the global flags and the exit-code
  taxonomy, so an agent learns the whole CLI surface in one read. `lore help <command> --json` returns
  the same manifest shape scoped to that one command. The manifest is now the **single source** for
  help text: the hand-kept `USAGE` literal is gone and `lore --help` renders from it too, so the two
  are byte-identical. Flags/kinds/exit codes are transcribed from live command source (not the design
  docs), and the exit-code taxonomy is built from `errors.ts` so it cannot drift; a bidirectional
  lockstep test pins the manifest's command set to the real router (every advertised command
  dispatches, and every dispatch case is advertised).
- **`lore agents` — generate/refresh the Claude Code agent bridge** (LORE-36, ADR-0004). Writes a
  generated `.claude/skills/lore/SKILL.md` (a small, grounded teacher that names the command surface,
  the `--json`/exit-code contract, and points at `lore instructions` as the source of truth) and a
  tiny marker-delimited `CLAUDE.md` nudge (`<!-- lore:agents:begin/end -->`) that points at the skill.
  Idempotent: regenerating with no change is byte-identical. The nudge is a **managed block** upserted
  via a new generic `upsertManagedBlock` engine (the insert-or-update sibling of the `lore:tasks`
  regenerator), so it never clobbers surrounding prose or an unrelated block (e.g. Backlog.md's).
  SKILL.md is a whole lore-owned file: the default run leaves a differing (hand-edited) one untouched
  and reports it, while `--force` overwrites it. `--check` reports drift without writing — a CI gate
  that exits `6` (`drift`) when the bridge is stale, `0` when current. Output is `kind: agents.result`.
  Generated content is grounded in live source, never a runbook (it names only real commands — no
  `lore tasks`), guarded by a lockstep test that runs each advertised command through the real router.
- **`lore link` / `lore unlink` — wire a concept's `tasks:` frontmatter to Backlog task ids**
  (LORE-24, ADR-0009 §1–§2). `link` adds task ids to the concept's `tasks:` list and records the
  back-reference on each task: a queryable `doc:<conceptId>` label plus the concept's repo-relative
  path via `--doc` (display-only). `unlink` removes both sides. Every task id is validated to exist
  before `link` writes anything (fail loud, no partial edit); `unlink` tolerates a task id already
  deleted from Backlog — the doc-side reference is still cleaned up, the back-reference edit is
  simply skipped. Because `--doc` is a SET/REPLACE flag (backlog-cli-contract §2.4), both commands
  read the task's current `documentation` array first and write back the full desired array, so
  linking/unlinking never clobbers an unrelated doc reference on a multiply-referenced task; when
  removal would leave the array empty, `--doc` is omitted entirely (Backlog cannot clear it via an
  empty value) — the cosmetic drift ADR-0009 already documents as an accepted tradeoff. `--no-back-ref`
  skips the Backlog-side edit on either command. Every task's back-reference edit is independent and
  freshly re-read right before writing; a single Backlog subprocess failure is reported on that
  task's row (`backRef: "failed"`) rather than aborting the rest, and the command exits `6` (`drift`)
  when any edit failed — edits run one at a time within an invocation (ADR-0012 §5: no concurrent
  mutating Backlog commands). Neither command will target a reserved hub stem (`index`/`log`), or a
  concept whose id collides case-insensitively with another concept's — Backlog's own label store
  de-dups case-insensitively, so two such concepts could not have independently addressable `doc:`
  back-references. `lore rename` now also moves every linked task's `doc:<conceptId>` label and
  `--doc` path to the renamed concept's new id/path (the file move commits first; the back-ref move
  is best-effort per task, `drift`/exit `6` on a partial failure, and never attempted for an
  unlinked concept or under `--dry-run`) — closing the gap where a rename would otherwise silently
  orphan a task's back-reference. For a concept relocated **outside** `lore rename` (`git mv`, an
  IDE refactor), `lore unlink <id> <taskId…> --allow-missing` tolerates `<id>` not resolving to a
  live concept and cleans up just the stale Backlog-side `doc:` label/`--doc` entry (there is no
  concept file to touch `tasks:` on) — the case-collision guard still protects a *live* concept
  whose id collides with `<id>`. Now consumed by `lore sync` (LORE-26); `lore check`'s read-only
  drift gate over the same data is LORE-27's job.
- **`core/reconcile.ts` — roll a Story/Spec's linked task statuses up into one derived `status`**
  (LORE-23). The pure engine behind the `status:` half of `lore sync`/`lore check` (ADR-0009 §3):
  `reconcileStatus(taskStatuses, statusFlow, overrides?)` classifies each linked task by its
  position in the project's **config-driven** ordered status flow — never hardcoded to the three
  Backlog defaults — and rolls up by elimination: every task terminal → `done`; any task in a
  non-first, non-terminal state → `in-progress`; otherwise → `todo`. A doc with no linked tasks
  returns `null` so its authored `status` is left untouched (a narrative-only doc is never forced
  into a workflow state). Fails loud (exit 6) on a task status absent from the flow (and with no
  override) or a degenerate (empty/duplicate) flow — lore reports a status it cannot classify rather
  than guessing. **`overrides` (LORE-26)** — sourced from `.lore/config.toml`'s `[reconcile.overrides]`
  — lets a status map straight to a rollup value, bypassing flow position entirely; validated against
  the three rollup values here (`config.ts` deliberately defers that check to this module). Reading
  `backlog/config.yml`'s `statuses:` and resolving each linked task's live status are command-layer
  concerns; wired into `lore sync` (LORE-26).
- **`core/managed-block.ts` — regenerate the `<!-- lore:tasks -->` region from live Backlog data**
  (LORE-22). The pure engine behind `lore sync` (writes) and `lore check` (diffs) rewrites a Story's
  managed task table from the JSON the LORE-21 adapter's `viewTask` returns. Markers are located
  **structurally** — the document is parsed with `mdast-util-from-markdown` and only a top-level
  `html` comment node is a candidate, so a sentinel inside a code fence or blockquote is never
  mistaken for a boundary — then the table is built as a **frozen-format string** and **spliced over
  the byte range between the markers**, copying frontmatter, editor modeline, and prose verbatim.
  This supersedes ADR-0008's `remark-stringify` step: lore ships no markdown serializer, so it
  follows the settled parse-to-locate + string-splice pattern of `rewrite.ts`/`indexes.ts` (ADR-0008
  amended). Regenerating an unchanged block is **byte-identical** (a fixpoint — a no-op `lore sync`
  touches zero bytes and the drift gate stays exact), and each row link comes from the task's
  `filePathRelative` (portable, cross-subtree, `%20`-encoded), never reconstructed from the
  upper-cased display id; a linked task with no on-disk file yet is tolerated (its id renders as
  plain text, never a broken link or an error). Malformed markers (missing/duplicated/crossed) fail
  loud (exit 6). Wired into `lore sync` (LORE-26); `lore check` (LORE-27) still diffs read-only.
- **`lore sync [paths…] [--dry-run] [--no-index]` — the write counterpart to `lore check`**
  (LORE-26, ADR-0009, ADR-0012, ADR-0013). For every concept whose `tasks:` links Backlog tasks:
  resolves each linked task's live status (`viewTask`, every id validated to exist **before** any
  write — a missing id fails loud, `not_found`/exit 3, no partial state), recomputes `status` via
  `reconcile.ts` (honoring `[reconcile.overrides]`) and rewrites it when changed, and regenerates the
  `<!-- lore:tasks -->` managed block (`managed-block.ts`) from the same data. Unless `--no-index`,
  also regenerates every bundle `index.md` (`indexes.ts`) and the git-history-derived `log.md`
  (`log.ts`, via a new real `git log`-shelling adapter, `adapters/git.ts`) pinned to the current
  `HEAD` sha (a repo with no commits yet gets an empty log, not an error). Every write is a byte-diff
  against current disk content first, so a fully clean tree is a true no-op (AC#1) — verified end to
  end against a real git repository, not just fakes. `--dry-run` computes and reports the same diff
  but writes nothing (`docs/` or `backlog/`); `[paths…]` scopes which concepts get
  reconciled/managed-block-regenerated (index/log stay whole-bundle, being inherently global). Each
  changed file is written **atomically** (`fswrite.ts`'s new `writeFileAtomic`: temp file + rename) —
  `sync` is the one command that can write many files in one invocation, so a crash mid-run must
  never leave any single file truncated. **`src/state.ts` (new)** — the `.lore/`-and-git-ownership
  module the design spec calls for (§2.4): a fourth injectable seam (`GitSpawn`, mirroring
  `BacklogSpawn`) backing `commitBacklogIfDirty`, which detects whatever is currently uncommitted
  under `backlog/` (from an earlier `link`/`unlink`/`rename`, or a human's direct `backlog task
  edit`) and commits exactly those paths in one `lore`-authored commit — satisfying ADR-0012's "lore
  is the sole committer of `backlog/`" (AC#2) by vacuuming up drift regardless of source, rather than
  requiring every Backlog-writing command to commit its own touch (tracked as a follow-up,
  retrofitting `link`/`unlink`/`rename` to commit immediately per the design's own sequence flow).
  Skipped entirely under `--dry-run`. Also new: `adapters/backlog.ts`'s `readStatusFlow` reads the
  project's ordered status flow directly from `backlog/config.yml`'s `statuses:` (defaulting to the
  three Backlog defaults when absent), rather than shelling a further Backlog subcommand.
- **`lore check` — status reconciliation + managed-block drift, the last two ADR-0007 passes**
  (LORE-27). `check` now reuses the exact pure engines `lore sync` writes with
  (`reconcile.ts`'s `reconcileStatus`, `managed-block.ts`'s `regenerateTaskBlock`) but only diffs
  against disk — this command never writes. A `Story`/`Spec` whose persisted `status` no longer
  matches its live Backlog rollup is a `status-drift` finding; a `<!-- lore:tasks -->` region that
  no longer matches what `sync` would render is a `managed-block-drift` finding — both are **errors**
  that always gate exit `6`, unlike the warn-only portability lint. **`commands/reconcile-shared.ts`
  (new)** extracts the task-resolution + reconcile-compute gather previously inline in `sync.ts` so
  both commands share one implementation rather than drifting apart; `sync.ts` was refactored onto
  it with no behavior change. Reconciliation runs per discovered bundle root (mirroring the existing
  multi-root link/anchor pass) but shares a single `BacklogAdapter` instance across roots, so its
  capability probe still runs at most once. A bundle with no `tasks:`-linked concept at all never
  constructs an adapter (mirrors `rename.ts`'s precedent) and `check` stays fully synchronous, the
  existing contract every caller relies on; otherwise `check` now returns a `Promise<number>`. A
  linked task id that no longer exists still fails loud (`not_found`, exit `3`); a concept with
  `tasks:` but malformed/missing managed-block markers still fails loud (`validation`, exit `6`) —
  both reuse `sync`'s own contracts unchanged. `check`'s file-discovery walk silently treats a
  malformed concept as reconciliation-ineligible **only when it carries no `tasks:` link** — that
  document's well-formedness is `lore validate`'s Tier-2 finding to report (ADR-0007's own
  validate/check split), not a second thing `check` re-derives. A malformed concept that DOES declare
  `tasks:` (or whose frontmatter YAML is itself unparseable, so its `tasks:` status can't be ruled
  out) still fails loud instead — `lore sync` would refuse to touch that exact file too, so silently
  treating it as un-linked would be the one case where `check` really would disagree with `sync`.
  **Behavior change:** discovery advisories (a skipped symlink, an unreadable sub-directory) now
  flush to stderr *before* the `check.report` is emitted to stdout, on every invocation — the reverse
  of `check`'s pre-LORE-27 order, deliberately: advisories are now known and flushed in full before
  any reconciliation step that could throw, so a later failure can never silently drop them (mirrors
  `sync`'s own long-standing order). A script that merges stdout+stderr and assumes report-then-
  advisories should re-check that assumption.
- **`adapters/backlog.ts` — the typed JSON-only Backlog.md read/write surface** (LORE-21). The
  capability probe (LORE-4) now backs a full typed adapter over the same injectable `BacklogSpawn`
  seam — the sole place a `backlog` subprocess is spawned and the sole place the `--json` schema is
  parsed. Reads (`listTasks`, `viewTask`, `searchTasks`, `searchByLabel`) `JSON.parse` the
  `{schemaVersion, kind, data}` envelope, assert `schemaVersion`/`kind`, Zod-validate `data` against
  the promoted contract mirror (moved out of the test support module into `src/`, so runtime and the
  golden fixtures lock to one schema), and map into lore's internal `BacklogTask`/`BacklogTaskDetail`
  types — surfacing only the portable `filePathRelative`, dropping the non-durable AC/DoD/comment
  `index`, and keeping `id` as identity. There is **no `--plain` text fallback** (ADR-0002): a bad
  envelope fails loud (exit 6). Writes go through `createTask` (id captured from the `Created task
  <ID>` stdout line, never JSON) and `editTask` (incremental `--add-label`/`--remove-label`);
  `viewTask` returns `null` on a missing id via empty stdout, never trusting `task view`'s exit code.
  The probe is memoized into every path, so a non-`--json`-capable Backlog is refused before any
  output is trusted. **Not yet wired into the CLI** — the coupling commands (`link`/`sync`/…) are
  LORE-22+; this is the adapter layer only.
- **`lore check --external` — opt-in external-URL liveness** (LORE-48). With `--external`, `lore
  check` probes every `http(s)` link in the bundle with Bun `fetch` (no Rust/lychee runtime
  dependency) and reports dead, unreachable, or timed-out URLs as advisory `external-link`
  findings. Because liveness is **non-deterministic**, these findings are kept entirely out of the
  deterministic gate (ADR-0007): they **never change the exit code — not even under `--strict`** —
  and the network IO lives in the command layer, never in pure `core/` (ADR-0014). Each distinct
  URL is fetched once (bounded concurrency, per-request timeout) and reported per referencing file;
  the `--json` envelope carries them in a separate `externalFindings` array, leaving the gate
  `errorCount`/`warningCount` untouched.
- **`lore check` portability lint additions** (LORE-48, warn-only): **MDX hazards** (un-escaped raw
  `<`/`{` in prose and raw HTML tags, which break Docusaurus's MDX build), **filename rules**
  (leading-underscore files/folders Docusaurus ignores as partials, and `.mdx` files), a precise
  **Obsidian block-reference** (`^id`) detector (sparing `x^2`, footnotes, and mid-prose carets
  while catching digit-leading auto ids), **accidental-colon filenames** (`notes:2026.md`, read as
  a `scheme:` URL), and **trailing-slash directory links** (`../reference/`).

- **`lore query` — full-text search the bundle with frontmatter filters** (LORE-33). `lore query
  ["<text>"] [--type <T>] [--tag <t>]… [--status <S>] [--field k=v]… [--limit <n>]` ranks concepts by
  **BM25-style** in-memory relevance to the search text and filters them by frontmatter — `--type`,
  `--tag` (repeatable, AND), `--status`, and an arbitrary `--field key=value` (repeatable, AND), all
  matched **case-insensitively** (AC#1). The lexical index is built fresh from the loaded graph over
  each concept's id, `title`, `summary`, `description`, `tags`, and body; a text query also acts as a
  relevance filter (a concept with none of its terms is dropped), and ties — and a **filters-only**
  query, where every score is `0` — break by ascending id, so the order is fully deterministic. Each
  hit carries a `summary`-derived one-line snippet (falling back to `title`, else omitted — the same
  compaction `lore context` applies). Output is **bounded** by `--limit` (default 20) with the standard
  `total`/`shown`/`truncated` signal and a *narrow-it* hint (AC#2). **No vectors, RAG, or chunking**
  (ADR-0015) — a deterministic lexical index, not a semantic one. Output follows the uniform CLI modes:
  a ranked text listing (pretty/plain) or the `kind: query.results` envelope under the global `--json`.
  Exit `0` ok (zero hits is still `0`) · `2` bad usage (unknown/repeated/value-less flag, non-integer/
  too-large/non-positive `--limit`, malformed `--field`, or a second positional). The BM25 search lands
  in the shared `core/query.ts` beside the `subgraph` traversal — the two halves of "navigate the
  bundle" (lexical relevance and structural reach) over one `BundleGraph`.
- **`lore context` — assemble a token-budgeted context pack for a concept** (LORE-34). `lore context
  <id> [--max-tokens <n>] [--depth <n>]` emits the target concept's **full body** plus a **one-line
  `summary` compaction** of its neighbors out to `--depth` hops (default 1), so an agent can be handed
  a concept *and* enough of what surrounds it within a budget. It is deliberately **structural, not
  ranked** (no relevance heuristics — that is `lore query`'s job): the neighborhood comes from the same
  shared, undirected, cycle-tolerant `core/query.ts` `subgraph` traversal `lore graph` uses, and
  neighbors are taken **nearest-first** (depth-1 before depth-2). Each token figure is the chars/4
  heuristic: the target is charged the whole-concept estimate (the same `~tokens` `lore graph` reports),
  and each neighbor is charged its emitted entry — `id` + `type` + `summary` (`summary` falls back to
  `title`, else nothing) — so a wide neighborhood of short summaries can't silently overrun the budget.
  `--max-tokens` trims neighbors greedily, **stopping at the first that would exceed the budget** (a
  predictable nearest-first prefix), reporting dropped neighbors via the standard `total`/`shown`/
  `truncated` signal with a *raise `--max-tokens`* hint. The **target is always included** even when it
  alone exceeds the budget — and that pack is honestly flagged `truncated` (with an `over budget` line),
  so a `truncated: false` always means "everything fit", never a silent overrun. With no `--max-tokens`
  the pack is bounded only by `--depth`. The `<id>` is normalized like `lore graph`/`rename`, and output
  follows the uniform CLI modes: a pasteable text pack (pretty/plain) or the `kind: context.export`
  envelope under the global `--json`. Exit `0` ok · `2` bad usage (missing or duplicate `<id>`,
  unknown/repeated/value-less flag, non-integer/too-large/out-of-range `--max-tokens` or `--depth`) ·
  `3` `<id>` not in the bundle. The `title` a concept reports is now byte-identical across `lore graph`
  and `lore context` (one shared `core/bundle.ts` `frontmatterScalar` coercion).
- **`lore graph` — emit the bundle's cross-link graph** (LORE-31). `lore graph [<id>] [--dot] [--depth
  <n>]` surfaces the graph `loadBundle` already builds — concepts as nodes (each with its `type`,
  optional `title`, and a chars/4 token estimate), OKF body cross-links and the
  `specs`/`supersedes`/`superseded_by` frontmatter refs as edges (a broken reference is a visible
  `dangling` edge, never an error). With **no `<id>`** it exports the whole bundle; with an `<id>` it
  exports the **subgraph** rooted there, bounded to `--depth` hops (unbounded when `--depth` is
  omitted), narrowed by a new shared, undirected, cycle-tolerant neighborhood traversal
  (`core/query.ts` `subgraph`) that `lore context`/`orphans` will reuse. The `<id>` is normalized like
  `lore rename`'s, so a path/`.md`/`./` form resolves to the same concept. Output follows the uniform
  CLI modes: a human node/edge listing (pretty/plain) or the `kind: graph.export` envelope under the
  global `--json` (nodes, edges, summed token estimate). `--dot` instead emits Graphviz DOT, so `lore
  graph --dot | dot -Tpng` works (a piped stdout auto-selects plain); `--dot` and `--json` are
  mutually exclusive. Exit `0` ok · `2` bad usage (`--dot` with `--json`, unknown/repeated/value-less
  flag, non-integer or too-large `--depth`, `--depth` without a root) · `3` root `<id>` not in the
  bundle.
- **`lore schema export` — materialize the profile's editor JSON Schemas** (LORE-20). `lore schema
  export [--out <dir>] [--type <T>]` writes one Draft-7 JSON Schema per active-profile type to
  `.lore/schemas/` (default), so the `# yaml-language-server: $schema=…` modeline `lore new`/`lore
  init` stamp resolves and drives YAML autocomplete/validation in VS Code and Obsidian (AC#1). The
  profile is loaded from the project's `.lore/profile.toml`, so a project's **custom** types export
  too (AC#2); with no profile present it is the built-in story-convention profile (zero-config). The
  per-type bytes come from the **shared** `core/schema.ts` `emitSchemaFiles` emitter that backs `lore
  init`, so an exported schema is byte-identical to a scaffolded one (two-space pretty JSON, one
  trailing newline). `--type <T>` exports a single type (resolved case-insensitively); `--out <dir>`
  redirects output and is **confined to the repo** (a `..`-escaping or absolute path is a usage error,
  so an overwrite can never clobber files outside the bundle). A **full** export (no `--type`) also
  **prunes** orphaned `<slug>.schema.json` files left by a type the profile no longer declares, so
  `.lore/schemas/` mirrors the active profile instead of drifting; a single-`--type` export prunes
  nothing. Two type names that reduce to the same lower-kebab slug — which would collide on one schema
  (and template) file — are now rejected at profile load (`core/profile.ts`) rather than silently
  overwriting each other. Output `kind: schema.result`; exit `0` ok · `2` bad usage / unknown or
  repeated flag / unknown `--type` / repo-escaping `--out` · `4` output directory not writable.
- **`lore supersede` — record a supersession both ways** (LORE-35.3, the last of LORE-35's three
  refactoring commands; delivers the supersede half of LORE-35). `lore supersede <oldId> <newId>
  [--rewrite-links] [--dry-run]` marks one concept superseded by another and wires the relationship in
  both directions: on the **old** concept it sets `status: superseded` and `superseded_by: <newId>`;
  on the **new** concept it **appends** `<oldId>` to `supersedes` (normalizing a scalar to a list and
  never clobbering or duplicating an existing entry — a concept may supersede several). Both edits go
  through the byte-stable `serializeConcept` under the **active profile** (so the written `status` is
  validated against the project's own profile — a custom `status` enum that forbids `superseded` fails
  fast here rather than slipping through to break the next `lore validate`), in canonical key order,
  so the wiring is the only diff and the whole body round-trips verbatim (ADR-0011). Unlike `lore
  rename`, the old file is **preserved as history** — nothing moves, nothing is deleted, and no
  `index.md` is regenerated (listings are unchanged). With `--rewrite-links` it repoints inbound
  **body links** to the successor by reusing the same pure `core/rewrite.ts` `rewriteInbound` engine
  `lore rename` ships, in place-only (`move:false`) mode, with two supersede-specific restrictions:
  (a) `specs`/`supersedes`/`superseded_by` **frontmatter** refs are left intact — because the old file
  is preserved, a third party's ref to it is a valid historical record, not a dead pointer, so
  repointing it would fabricate a relationship that never happened; and (b) the two **principals** and
  the machine-owned `index.md`/`log.md` hubs are **excluded** — the old doc's own (historical) body
  links and the new doc's legitimate links *to* its predecessor stay intact (so the successor is never
  made to link to itself), and a generated hub is never hand-rewritten. All validation lives in the
  thin `commands/supersede.ts` (the engine's `move:false` path checks only that `oldId` exists): both
  ids must name concepts and neither may be a reserved hub name; the old concept must not already be
  superseded — `status: superseded` (matched case-insensitively) **or** an already-recorded
  `superseded_by` (which would otherwise be silently overwritten, losing the recorded successor).
  Exit `0` ok · `2` bad usage / self-supersede / reserved id · `3` either id not found · `5` old id
  already superseded. The `rewriteInbound` engine gained two reusable options for this —
  `rewriteFrontmatterRefs` (default `true`, preserving `lore rename`'s behavior) and an `exclude` id
  set — and `core/bundle.ts` now exports a shared `conceptNotInBundle` `not_found` factory so the
  command layer and the engine surface identical wording.
- **`lore rename` — graph-aware concept rename** (LORE-35.2, the second of LORE-35's three refactoring
  commands; delivers LORE-35 AC#2). `lore rename <oldId> <newId> [--dry-run]` moves a concept to a new
  id/path and repoints **every** inbound reference to it — body cross-links (including used
  reference-style definitions, with any `#fragment`/`?query` preserved) and `specs`/`supersedes`/
  `superseded_by` frontmatter refs (rewritten to the canonical bare-id form) — then recomputes the
  moved file's **own** outbound links against its new directory (a sibling becomes a `../` link, a
  self-link retargets, and even a dangling link is corrected by pure path arithmetic), and regenerates
  the affected `index.md` listing hubs against the post-rename graph. The new pure `core/rewrite.ts`
  engine (`rewriteInbound`, 100% func) computes the rewrite plan from the bundle graph and edits link
  destinations by a **surgical mdast-position string splice** — never parse→stringify — so authored
  prose outside a changed destination is byte-for-byte unchanged (AC#3) and no markdown serializer is
  pulled in (ADR-0001/ADR-0008 §7). Because a parsed `node.url` is not byte-equal to its source
  (angle-bracket `<…>` wrapper stripped, `\(`→`(` unescaped, `"title"` dropped), the destination's
  exact byte range is located structurally inside each link node rather than by text search.
  Resolution mirrors the bundle graph's own rules (case-sensitive, leading-slash absorbed), so it
  rewrites exactly the edges the graph counts; only **concept** files are rewritten (a link from a
  non-concept file is left for `lore check`). The thin `commands/rename.ts` owns IO: it loads the
  bundle, relocates the renamed file atomically (`fswrite.moveFile` renames the inode), skips an
  unrelated already-canonical hub (no churn), and emits a `rename.result` report. Exit `0` ok · `2`
  bad usage / same id / reserved target name · `3` old id not found · `5` new id already exists.
  Hardened after a `/code-review max` pass that found 15 correctness defects, all folded — a cluster
  of them silent **data loss**: a case-only rename (`Foo`→`foo`) on a case-insensitive filesystem no
  longer deletes the just-written file (the file is **renamed**, not write-new-then-delete-old); a
  `newId` that collides with an existing file is rejected even when it differs only in **case** or is
  a **non-concept** `.md` (the conflict guard now checks the filesystem, not just the graph); renaming
  onto a reserved `index`/`log` name is refused; renaming into a **not-yet-existing directory** now
  creates it (`mkdir -p`) instead of failing ENOENT; and emptying a directory of its last concept now
  **clears that directory's stale `index.md` listing** instead of leaving a dead link in a managed
  block. The rewrite engine was tightened too: the moved file's own path-form **frontmatter** refs to
  *other* concepts and its **orphan** reference definitions are now recomputed for the new location
  (previously asymmetric with body links); a `#fragment`/`?query` is preserved from the **source**
  bytes (not the decoded `node.url`), keeping AC#3 byte-fidelity; and the engine now **reuses**
  `bundle.ts`'s `resolveRef`/`internalTarget`/`resolvePath`/`REF_FIELDS` (exported) instead of
  re-implementing them, so its trimming and classification can no longer drift from how the graph
  counts edges. (Full cross-file transactional rollback on a mid-commit IO failure remains a shared
  concern with `lore replace`, deferred.)
- **`lore replace` — managed-region-safe find-and-replace** (LORE-35.1, the first of LORE-35's three
  refactoring commands). Literal or regex (`--regex`, with `$1`/`$&` substitution) find-and-replace
  across one doc or the whole `docs/` bundle (`--in <glob>`, repeatable), with `--dry-run` to preview.
  Its inviolable rule is AC#1: a lore-**managed region is never touched**. The pure `replaceInText`
  engine (`core/replace.ts`) partitions each file at its managed-region boundaries and rewrites only
  the author-owned gaps, stitching every managed region back byte-for-byte and counting matches
  outside those regions only — so a refactor can never corrupt or churn machine-owned content that
  `lore sync` regenerates. Managed regions come from a small extensible marker registry
  (`MANAGED_MARKERS`); today the only kind is the `<!-- lore:index:begin/end -->` listing block
  (markers imported from `core/indexes.ts` for one source of truth), with `<!-- lore:tasks -->` a
  one-entry addition once LORE-22 lands. The thin `commands/replace.ts` owns discovery/IO: `.md`-only
  targeting (a glob match on `mkdocs.yml` or other config is left alone), `Bun.Glob` scoping confined
  to the repo, overwrite writes via a new `fswrite.writeFileOverwriting`, and a `replace.result`
  report (per-file counts + run totals). Exit `0` ok · `2` invalid regex / bad usage. Delivered as
  pure core (100% line/func) + tests.
  Hardened after a `/code-review max` pass that found 11 correctness defects, all folded: the engine now
  runs **one pass over the whole document** (so regex anchors/`\b`/lookaround bind to the real document,
  not to the gaps around a managed block) and skips any match overlapping a managed region, with explicit
  `$1`/`$&`/`` $` ``/`$'`/`$<name>` expansion verified byte-for-byte against `String.prototype.replace`;
  an empty-**matching** pattern (`x*`, `a?`, `\b`, `^`, …) is rejected up front, not just the literal
  empty find; managed-region bounds are now located by the **shared** `indexes.locateManagedBlock`
  (first-begin → last-end) so `replace` protects exactly the span `lore sync`/`check` regenerate
  (including the prose between two blocks); discovery **skips symlinks** (a write can't escape the repo),
  **de-duplicates by canonical realpath** (one physical file rewritten once, never double-applied),
  resolves **absolute `--in` globs** correctly, and **excludes the generated `log.md`**; the pattern is
  validated **once up front** so a bad pattern fails even with zero matched files; all reads + replaces
  complete **before any write** (a read error or bad pattern aborts atomically, leaving the bundle
  untouched); a **no-op** replacement (`find === replace`) changes and reports nothing; and
  `writeFileOverwriting` maps `EISDIR` to a `conflict` (exit 5). The shared file-read/identity helpers
  were extracted to `commands/discover.ts` (`readSource`/`canonicalIdentity`/`toRepoRelative`/
  `withinRepo`), de-duplicating the copies in `check`/`validate`. (The shared flag-tokenizer cleanup
  across the four command parsers is deferred.)
- **`lore check` — internal link/anchor validation + portability lint** (LORE-30). A new read-only
  coherence gate built on the pure `checkBundle(files)` engine (`core/check.ts`): a whole-bundle pass
  that (1) resolves every internal relative `.md` cross-link against the **full bundle file set**
  — concepts *and* the frontmatter-free `index.md`/`log.md` hubs, so a generated hub link to a
  non-concept sub-index resolves rather than falsely reporting broken (the LORE-29 link-gate
  follow-up) — reporting a missing target as a `broken-link` **error**; (2) validates every
  `#fragment` against the target file's GitHub-style heading slugs (deduped `-1`/`-2`), reporting
  anchor rot as a `broken-anchor` **error** (AC#1), including same-file anchors; and (3) lints
  portability — non-portable link *form* via the shared `validateLink` classifier plus an
  mdast-text-node scan for wikilinks, embeds, callouts, highlights, `%%`-comments, and block refs
  — as **warnings** that never fail the gate on their own (AC#2). Built on the existing
  `mdast-util-from-markdown` + `walkMdast` machinery (no `remark-validate-links` / `unified`
  dependency, keeping zero-config `bunx`); the thin `commands/check.ts` owns discovery/IO/exit and
  exits `6` on any broken link/anchor (or any warning under `--strict`), `0` otherwise. `--external`
  (external-URL liveness) is **accepted but deferred** — a stable surface with no non-deterministic
  networking in the gate. Scope (LORE-30): the two deterministic, dependency-free passes; the
  status-reconciliation and managed-block-drift passes (which need the Backlog JSON adapter +
  `lore sync`, LORE-26) are wired in later. Delivered as pure core + tests (`core/check.ts` 100%
  line/func).
  Hardened after a `/code-review max` pass: the GitHub slugger now runs the full github-slugger
  collision loop (so `Release`/`Release 1`/`Release` yield `release`/`release-1`/`release-2`, not a
  false broken `#release-2`); each root passed to `lore check` is now an **independent bundle with
  its own id namespace** (two roots sharing a relative path like `index.md` no longer drop or shadow
  one another); a `/`-absolute link resolves against the bundle root (not the linking dir); the
  callout detector is anchored to the start of a blockquote line (a literal `[!important]` mid-prose
  no longer false-warns under `--strict`); the bundle-escape test no longer mis-skips a file literally
  named `..x.md`; each file body is parsed by mdast **once** and shared across the heading/link/
  portability passes; and `bodyText` reuses the canonical `normalizeInput` + gray-matter boundary
  (with `nodeText` hoisted to `bundle.ts` so anchor slugging and section matching can't drift). The
  noisy block-reference detector and accidental-colon-filename detection are deferred to LORE-48.
- **`validateLink` `unencoded` lint aligned with the writer's alphabet** (LORE-30, from the same
  review). A path segment is now canonical iff it is only RFC-3986 unreserved characters and valid
  `%`-escapes — so a raw `! ' *` (which `encodePathSegment` percent-encodes) is flagged, keeping the
  linter and writer in agreement, while an over-encoded `%41` or lowercase `%c3` still passes.
- **`validateLink` classifier hardening** (LORE-30, folded from PR #19's `/code-review max`). Fixed
  the per-link portability classifier now that `lore check` is its first caller: a **wrong-case**
  `.md` (`orders.MD`) is flagged (404s on a case-sensitive host) while **dotfiles** (`.gitignore`),
  **directory links** (`../reference/`), and other **asset** extensions are correctly left alone; the
  extension is judged on the **decoded** path so the linter and the bundle resolver agree;
  destination-breaking characters in a `#fragment`/`?query` are now scanned (not just the path); a
  **valid-but-non-canonical** encoding (`a%41b.md`, lowercase `%c3`) is accepted instead of mislabeled
  `unencoded`; an interior `//` is reported; and a **malformed** `%`-escape gets its own message. A
  shared `pathPart()` (`stripQuery ∘ stripFragment`) replaces the three duplicated call sites and is
  reused by `bundle.ts`.
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
  Hardened after a `/code-review max` pass: untrusted titles are single-lined, bracket-escaped, and
  have HTML-comment sentinels neutralized (a title cannot break a link or poison its own block); the
  splice collapses duplicate blocks (first-begin → last-end) and rewrites a truncated region to EOF
  so regeneration converges to a fixpoint from a merge-corrupted file; and a present-but-empty index
  is synthesized like an absent one. Known follow-up for the link gate: a generated root hub links to
  frontmatter-free sub-indexes (not graph concepts), so `lore check` (LORE-27) must treat reserved
  `index.md`/`log.md` link targets as resolved, not broken.
- **`core/links.ts` — the canonical cross-link form in one place** (LORE-28). The single home for
  the ADR-0010 link rule (relative · URL-encoded · `.md`-suffixed · no leading slash · no
  wikilinks), so the form can never be spelled two ways. `normalizeLink(fromPath, toPath, anchor?)`
  is the deterministic **writer** (path arithmetic over `posix.relative`, canonical lowercase `.md`
  coercion, per-segment encoding); `validateLink(target)` is the per-link portability **classifier**
  (`leading-slash`/`missing-extension`/`unencoded`) that `lore check`'s lint will compose. The
  segment encoder (`encodePathSegments`) is shared with the `resource:` URL stamper, and the
  destination classifiers (`isExternalTarget`/`decodeTarget`/`stripFragment`/`stripQuery`) moved out
  of `bundle.ts` into `links.ts` and are re-imported there. Pure core (lore-design §2.1): string in,
  string/typed-finding out; non-portable input is a finding, never a throw. The command wiring
  (new/sync/link/index-gen/managed-block) and the graph-wide passes land with their consumers
  (`validateLinks`+anchors → LORE-30; `rewriteInbound` → LORE-35). **Behavior ripple:** the shared
  encoder now also percent-escapes the markdown-significant `! ' ( ) *` that `encodeURIComponent`
  leaves raw, so a `lore new` `resource` URL for a doc path containing those characters is now
  correctly escaped (an unbalanced `)` previously truncated such a link on CommonMark/MkDocs). To
  keep that ripple non-breaking, `lore validate`'s resource-drift check now compares decode-tolerantly
  (`decodeTarget` on both sides), so a `resource` stamped before the encoder tightened (literal
  `( ) ! ' *`) is recognized as equivalent — not falsely reported "stale" — on upgrade.
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

### Changed
- **`lore link` / `lore unlink` / `lore rename` now commit their `backlog/` writes immediately**
  (LORE-49): each command's `doc:<conceptId>` back-reference edit is committed in one `lore`-authored
  commit right after it is written (via `state.ts`'s new `commitBacklogFiles`), instead of being left
  uncommitted in the working tree until the next `lore sync` swept it up — matching design §3.6 and
  [ADR-0012](docs/adr/0012-backlog-coexistence-git-ownership.md) ("lore is the sole committer of
  `backlog/`"). The commit is **scoped to exactly the task file(s) the command edited** (ADR-0012 §1:
  "stage only the specific task file(s)"), so an unrelated in-flight `backlog/` edit is never swept in,
  and `--no-back-ref`, a fully idempotent re-link/unlink, an unlinked rename, and `--dry-run` (which
  write nothing) commit nothing. `lore sync` remains the catch-all that later commits anything still
  uncommitted under `backlog/`. The outcome is now reported — `link.result` / `unlink.result` /
  `rename.result` gain a `backlogCommit: { committed, files }` field, and text output appends a
  `committed backlog/: N files` line. A failed commit surfaces loudly as `drift` (exit 6), never
  silently.
- **`lore check` internals** (LORE-48): the `validate`/`check` finding model is unified on a shared
  `Severity`/`Finding<Rule>` (`core/finding.ts`); the filesystem-errno→`LoreError` mapping is
  consolidated into one `ioError` policy (`errors.ts`); `bundle.ts`'s markdown walk is generalized to
  a predicate-driven `walkFiles`; and `normalizeLink` now rejects absolute operands and computes a
  cwd-independent relative link.

[Unreleased]: https://github.com/jeremy-newhouse/lore/commits/dev
