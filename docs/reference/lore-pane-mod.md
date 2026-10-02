---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Lore pane mod
tags:
  - lore-cli
  - opum-lore
  - claude-code
  - mods
  - plugin
summary: "The Lore pane shipped in the opum-lore plugin (LCLI-664, 2026-10-02): what it does today, the state and engine constraints it is built around, and the harness that validates it."
timestamp: 2026-10-02T16:59:26.596Z
---

# Lore pane mod

The **Lore pane** is a Claude Code pane over the repository's documentation bundle,
shipped as a hooks module (a "mod") in the `opum-lore` plugin. Its source is this
repository at a release tag, so a plugin user gets the pane that shipped with the CLI
version they installed. It was designed from opum-doc's brief (`docs/reference/lore-mod-design-brief.md`
in `opum-doc`, read by ref at `e62e764` on 2026-10-02) and built under LCLI-664,
mirroring the Quest board mod in `quest-cli` (QCLI-431, draft
`opum-ai/quest-cli#481`).

The pane drives the `lore` CLI rather than reimplementing it: browsing, reading,
searching, creating and editing all run lore's own commands, so frontmatter validation,
link repointing on rename, and managed task blocks stay lore's behaviour. Everything
below is as built at `f71bed1c` (2026-10-02), the first slice's landing commit.

## Where it ships

- Files, in the plugin-root layout: `hooks/hooks.json` (which registers the module —
  `{"modules": ["./register.tsx"]}`), `hooks/register.tsx` (the pane), `hooks/lore.ts`
  (the lore-CLI half), `types/index.d.ts` (the state contract), and `tests/` (the
  engine's tests). `.claude-plugin/plugin.json` names the types file and describes the
  plugin as shipping the pane.
- **Mods need Claude Code 2.1.287 or later**; the fleet freeze is the 2.1.287 pair.
  The harness enforces the floor itself — it fails rather than skips on a missing or
  older `claude`.
- `opum-marketplace`'s `opum-lore` entry pins this repository at a tag and moves the
  pin after a release; at the reading recorded on LCLI-664 (2026-10-02) it was
  `v0.12.0`, and the release that carries the pane is still to be cut. **No tagged
  release carries the pane yet:** measured 2026-10-02, `git ls-tree v0.12.0 hooks/`
  returns nothing. Once the release exists, [Lore CLI release truth](lore-cli-release-truth.md)
  is the record that will carry its evidence.

## What the pane does today

The module registers a `lore-pane` command that opens the pane (`session.start` also
opens it, unfocused, and registers the command). The pane's id is `lore-pane`, its
title "Lore", and on a mobile surface it says it needs the terminal or desktop. Its
root is the session cwd's git toplevel (`git rev-parse --show-toplevel`); it refreshes
on an explicit Refresh button and every 30 seconds while it is shown.

### Browse

Lists the bundle's concepts from `lore query` with no text, grouped by type in name
order with a count per group — applying whatever type/tag filters the Search tab last
set and the chrome's refs toggle. Pressing a row opens it in Read. The drawn list is
bounded by the pane's height (and a 120-row cap); the header line reports the concept
count the query returned.

### Read

Opens a concept with `lore read`, and its linked tasks with `lore tasks` (id and live
status; a rollup that cannot be read leaves the strip empty rather than failing the
read). The header names the id, type, status, tags and linked-task count, and lists the
type's required sections as a present/missing checklist from `lore types`.

- **Rendered** draws the authored body as Markdown. Internal link clicks resolve
  relative to the open concept and open it in the pane; Back walks a bounded history
  (the last 50 ids).
- **Raw** draws the file exactly as on disk, frontmatter included, read through the
  engine's filesystem.
- Bodies are drawn capped at 9,500 characters, with a notice and the file path for the
  rest.
- **Fields editing** opens a form for title, summary, tags and status. Save rewrites
  only those frontmatter keys in the raw file (values as quoted YAML scalars, tags as a
  flow list, the body untouched), writes the file, then runs `lore validate` on it. A
  validation failure restores the previous bytes and shows lore's own first
  error-severity message; a success says so and reloads the concept.
- **Ask Claude…** fills the prompt box with `Revise the document <id> in this
  repository: ` and sends nothing itself — the person sends it, so Claude's normal
  permissions and this repository's documentation rules apply. This is the body-editing
  arm shipped while the operator's body-editing question is open (see below).
- **Structural operations** — Rename…, Supersede…, Link task…, Unlink task… — run
  `lore rename` / `lore supersede` / `lore link` / `lore unlink` and then `lore sync`.
  Rename and Supersede take one target id; Link and Unlink take whitespace-separated
  task ids. A failed `sync` is reported after the operation itself succeeded.
- The state contract declares `ConceptDoc.links` (inbound and outbound ids), but
  nothing populates it today: the pane draws no link graph.

### Search

A text input, a type picker built from `lore types`, and a tag input, all submitted
through `lore query`. Results show title, type, id and snippet; pressing one opens it
in Read. A chrome toggle adds `--across-refs --allow-partial` to Search and Browse
alike; it is a view, not a gate, so partial cross-ref coverage reports rather than
refusing.

### New

A type picker from `lore types` (with the type's required sections named as a hint), a
title, summary and tags; Create runs `lore new <type> <title>` with those fields and
opens the result in Read. The pane allocates no id of its own and passes no path: the
id it opens is whatever `lore new` returns, so it cannot mint ids that ignore other
refs — the create-path counterpart of the id-collision defect the quest-cli prototype
showed.

### The uncommitted-changes landing strip

Reads `git status --porcelain` in the repository root and keeps the Markdown paths
(renames resolved to the new path). When any exist, the pane shows the count and an
"Ask Claude to land them" button that fills the prompt with an instruction to land
them through a branch and pull request following the opum-sdlc skill, naming
`lore check` as the definition of done.

## The state contract

`types/index.d.ts` is named as the plugin's `types` in `.claude-plugin/plugin.json`,
and `claude plugin validate` holds every `$.state` key the module names to what it
declares. Four atoms carry the pane: `view` (tab, root, search text, type/tag filters,
the refs toggle, the open concept and its history, Raw, the structural action form,
loading/error/notice), `catalog` (concepts, the type vocabulary, search hits), `doc`
(the open concept), and `edits` (the write-in-flight flag, the New draft, the fields
form, the uncommitted paths). The module imports it with `import type`, so the file
carries no runtime code.

## The engine constraint it is built around

Claude Code's mod validator refuses `$` — or any noun of `$` — passed across an import
("$ is followed only into a function declared in this same file, never across an
import", as the module's own comment records it). So every `$.noun.method(...)` call
lives in `register.tsx`, and `hooks/lore.ts` takes plain values only: an argv to run,
a run's own result. It also means the CLI half is imported pure — its unit tests
exercise argvs and parsers with no engine present.

Two consequences the module states and relies on:

- **Parse stdout alone.** `lore` prints lint warnings to stderr even under `--json`, so
  the pane reads stderr only to explain a non-zero exit. A command that cannot start at
  all resolves exit code `-1` and says "lore could not run (is it on PATH?)"; a run
  times out at 30 seconds.
- **Run lore's commands rather than reimplementing them.** Rename, supersede, link,
  unlink and the fields form all go through the CLI — the same reason the pane's
  `lore validate` step exists instead of a hand-rolled frontmatter check.

## The harness

`scripts/mod-test.mjs` (`bun run test:mod`) is the mod's gate. It stages exactly what
the plugin ships — `hooks/`, `types/`, `tests/`, `skills/`, plus `.claude-plugin/` —
into a temp directory and points the engine there, because the mod's tests import
`claude-code/testing`, which exists only inside that engine, and `tests/` is
deliberately not this repository's CLI suite (bunfig.toml prunes it from `bun test`'s
discovery). The stage is the point: the mod is tested against exactly what the plugin
ships, and nothing else.

The harness is explicit about every way it can test nothing or check less than it
claims:

- A missing `claude`, one older than 2.1.287, a missing `tsc`, a shipped directory that
  is absent, or a stage with no hooks module all **fail** the run rather than skipping
  or passing; a run that could not stage is a run that tested nothing.
- It runs `claude plugin validate --strict` and `claude plugin test` against the stage.
  `--strict` is the CI arm of the validator: it fails on unrecognized fields and
  missing metadata the runtime merely tolerates.
- The typecheck is a second step with three named states, and the closing line says
  which one ran rather than passing quietly. It typechecks against the declaration the
  engine laid beside the stage when one is there; otherwise against the bundled
  declaration the plugin-authoring skill leaves in the machine's temp directory, and
  only when that declaration's own first line names the exact Claude Code running the
  tests; otherwise it prints **NOT TYPECHECKED** and names the declarations it did find.
  The typecheck is machine-local by nature — the engine writes its declaration only for
  a session-loaded mod — so CI cannot assert it, and the harness refuses to imply it.
- The stage is kept for inspection on failure and removed on success.

CI runs the harness from `ci.yml`'s `mod gate (opum-lore plugin)` job (ubuntu-latest,
installing the pinned `@anthropic-ai/claude-code@2.1.287`); the job's own comment
records that it is deliberately not a required status context.

### What the tests prove, and what they do not

Against the engine at `f71bed1c`, the record's measurement was `claude plugin validate
--strict` exit 0 — its inventory holding the `session.start` hook, the
`command.run{command=lore-pane}` registration, `ui.render{Pane}`, the calls
(`process.run`, `fs.read`, `fs.write`, `prompt.fill`, `command.register`, `clock.every`,
`ui.open`, `ui.panes`, `ui.resolve`) and the four state keys — `claude plugin test`
12/12 pass, and `tsc` against the 2.1.287 engine declaration exit 0.

The engine tests cover: browse, open, Back and the Raw toggle (the first test mounts
on both the terminal and the desktop surface; the rest mount the terminal); search
submission and the `--across-refs --allow-partial` argv; the type filter; the fields form saving through
`lore validate`; a failed validation restoring the previous file and showing lore's own
message; New running `lore new` and opening the result; the rename and `lore sync`
argvs; and a body link press opening the linked concept in-pane. Unit tests cover the
pure helpers: `patchFrontmatter` (replace, remove, insert, and the no-frontmatter
refusal), `bundleIdFor`, `internalHrefs`, `hasSection` and `groupByType`.

What they do **not** cover, and this record therefore does not claim: pressing
Supersede, Link task or Unlink task; Ask Claude…; the landing strip's button; the
mobile branch; and the `session.start`/`command.run` registrations beyond what
`claude plugin validate`'s inventory reads. No test runs a live `lore`: every command
is mocked at the engine boundary.

## Decisions recorded here

The orchestrator's review of 2026-10-02 settled where design choices are recorded:
**ADRs only for decisions the operator actually makes**; the module's own choices go in
this Reference and on the task record. These are the module's own:

- **Repository-only scope in v1.** The pane resolves the session's git toplevel and
  reads and writes there. A fleet/workspace view — reading other repositories' bundles
  through a Lore workspace manifest — is deferred to the operator's open question;
  `opum-family` currently fails to load because one member does not validate.
- **One canonical source.** The module was built in the repo layout from the start
  rather than as a dev-mods hot-reload copy, so there is a single source and the same
  staged validate/test/tsc loop runs locally and in CI.
- **Coverage answer.** `hooks/`, `types/` and `tests/` stay outside both tsconfigs'
  includes and `biome.json`'s includes, mirroring `quest-cli`'s shape; the mod's own
  harness is what covers them end to end, and the tsconfig covenant comments record
  that (measured 2026-10-02 with a positive control: a file outside those globs is not
  scanned at all).
- **No local id allocation.** New hands the type, title, summary and tags to
  `lore new` and opens whatever id comes back.
- **Body editing is not yet the operator's chosen arm.** The brief named three arms —
  an external editor, an in-pane editor, or Claude-assisted only — and the operator's
  question has not been answered as of 2026-10-02. Until it is relayed, the pane ships
  Claude-assisted revision (Ask Claude…) and the fields form; the selected arm is
  LCLI-664's separate acceptance criterion.

## What is deliberately not here

- **No ADR.** The operator's design questions (body editing; fleet view; one mod or
  two) are unanswered as of 2026-10-02. Their answers, once relayed, are recorded
  verbatim as ADRs under LCLI-664 — not re-derived here, and not decided locally.
- **No behaviour beyond the tests.** Anything the tests do not press is unclaimed
  above, and the pane's shape is described at its landing commit rather than at what
  the brief proposed.
