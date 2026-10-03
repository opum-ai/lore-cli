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
below is as built on this task's branch (2026-10-02) — the module at `f71bed1c`, the
bundle-path fix `5e9c8ab4`, the harness `f444a654`, the documentation slice `38f2affd`,
and the pre-landing reviewer pass that followed them. No single commit holds all of it;
the branch tip does.

## Where it ships

- Files, in the plugin-root layout: `hooks/hooks.json` (which registers the module —
  `{"modules": ["./register.tsx"]}`), `hooks/register.tsx` (the pane), `hooks/lore.ts`
  (the lore-CLI half), `hooks/editor.tsx` (the inline editor's `Client` surface
  module), `hooks/editor-ops.ts` (its editing operations, engine-free),
  `hooks/vendor/` (the vendored editing model, with its licenses and record),
  `types/index.d.ts` (the state contract), and `tests/` (the engine's tests).
  `.claude-plugin/plugin.json` names the types file and describes the plugin as
  shipping the pane.
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

**The pane has no slash command of its own.** The `lore` skill owns the bare slash
name, so a mod command named `lore` is unreachable -- and on Claude Code 2.1.288
registering one does worse than go unreachable: it throws and the whole `session.start`
hook is skipped. Measured 2026-10-03 against a clean export of the tree that carried the
rename: `opum-lore: session.start hook skipped: threw opum-lore: $.command.register:
"/lore" refused: it is the plugin's /opum-lore:lore` -- with the pre-rename tree as the
control, where the same probe printed `opum-lore: Lore pane opened.` and no skip. Both
`claude plugin validate --strict` and the module's tests pass over it, so only a live
session sees it. The registration is therefore dropped (opum-doc seq 176/180) rather
than left dead, and the pane opens through the skill's `dashboard` verb calling the
module's tool (see "Opening the pane").

`session.start` registers that tool and opens the pane, unfocused. The pane's id is
`lore-pane`, its title "Lore", and on a mobile surface it says it needs the terminal or
desktop. Its root is the session cwd's git toplevel (`git rev-parse --show-toplevel`);
it refreshes on an explicit Refresh button and every 30 seconds while it is shown.

### Opening the pane

The pane's only entry point is the module's tool, `mcp__opum-lore__dashboard`, which
`session.start` registers and a `tool.call` hook serves. Claude can call it directly, and
the `lore` skill routes to it so a person can ask for the pane in words or as a slash
command:

- `/lore dashboard`, `/lore dashboard full`, `/lore dashboard <doc-id>` and
  `/lore dashboard search <text>` -- and the same phrases in plain words -- reach the
  tool, mapping to its `full`, `doc` and `query` inputs. There is no bare `full` or
  `pane` verb, and every argument that does not start with `dashboard` goes to the CLI as
  it always has.
- **The tool never takes the keyboard.** Every open it makes is without `focus`, because
  Claude may call it while the person is typing; a Tab or a click gives the pane the keys.
- **Its arguments are validated, not trusted** -- any plugin can call it -- so a
  non-string `doc`, a non-boolean `full` and an unknown concept id are each refused by
  name, and an unknown id opens nothing else in its place.
- The skill states the **fallback** for where the tool cannot exist -- Claude Code older
  than 2.1.287, a `claude -p` run, or mods off: say the pane is unavailable and answer
  from the CLI instead. `skills/lore/SKILL.md` is **generated**
  (`bun run scripts/plugin-skill.ts --write`, from `buildSkillDoc()` in
  `src/core/agent-bridge.ts`), never hand-edited, and the pane section is written for
  the plugin variant only: a per-repository bridge has no mod to call.

### Full screen

`z` inside the pane, and the tool's `full` argument (see below), each flip
the pane between its normal size and the largest the surface allows; a second press
flips it back, and the command answers with the state it left the pane in. Anything
else after the command name is refused by name rather than ignored. The **size is
requested by a draw, not by the key**: `e.viewport` exists only on a render event, so
the key, the command and `session.start` record the choice and the next draw asks the
surface for the size it implies.

- **Docked** panes ask in `columns` — the viewport's width less 20 columns, so the
  transcript stays readable beside the pane (`DOCK_MARGIN_COLUMNS`); **inline** panes ask
  in `rows` — the viewport's height less 6 rows for the prompt area
  (`PROMPT_AREA_ROWS`). The engine has no read for the composer — `e.viewport.rows` is
  the whole surface and `RenderViewport` carries nothing for the prompt — so the design
  names that margin and the module uses its figure. Both are requests, not grants — the
  surface clamps to what the layout spares, and the docked arm computes the same way as
  the command's own `presentation.columns`.
- **A reopen the person started carries `focus`** — the `z` hotkey. The tool never does. One the pane makes by itself — a remembered full mode's first draw, or a
  re-request after the viewport changes — carries none, so a full pane restored at
  startup never takes the keyboard from the prompt; a Tab or a click gives it the keys.
  `closeOnEscape` is never passed: that flag is what would make the pane a dialog rather
  than a pane.
- **Each distinct request is made once** (the module's `lastRequest`), and again when the
  viewport's size changes, which the request key carries. A size the person dragged wins
  over the request, so a pane that re-asked on every draw would ask forever. A surface
  that reports no viewport asks for nothing.
- **The choice is remembered** in `$.store` under `pane-mode` and restored at
  `session.start`, where the first draw applies it. A store that refuses the write loses
  only the memory, not the toggle.
- **When the surface keeps a size other than the one asked for**, the pane draws one line
  — `Drag the pane edge to resize; z switches layouts` — rather than claiming a size it
  did not get. A granted size measures a few cells short inside the frame, so a request
  within 4 cells of the size drawn counts as granted (`SIZE_SLACK`) and anything further
  off is read as the person's own drag. The render event carries the size drawn and not
  its reason, so a drag and a clamp by the layout read identically; the hint is
  suppressed in normal mode, where there is no requested size to fall short of.
- **At 120 or more body columns** (`e.props.bodyColumns`, full mode only) the bundle list
  draws in a left column with the document on the right, on Read and Search alike. On
  Read the left column is the browse list, with the open document's row drawn at full
  strength where the rest are dim; on Search it is the results, marked the same way.
  Below 120, and at the normal size, both tabs keep the stacked layout. The list column
  takes about a third of the body, clamped to 24–48 columns, and the Search form stays
  pane-wide: it is how the list is made rather than part of it, and a third-width column
  would crush it. The design names no width and does not say where the form goes; both
  are the module's own choices, recorded here.

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
- **Body editing** is the arm DEC-132 decided (ADR-0026), and it ships as two: a
  **lightweight inline editor** and an **Open in editor** action.
  - *Edit body* opens the inline editor on the Read tab: a `Client` surface module
    (`hooks/editor.tsx`) drawing the body's lines with the cursor cell inverted, keyed
    by `hooks/editor-ops.ts` — arrows, home/end, backspace/delete, Enter, and
    Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) for undo and redo. A key is text when the
    engine hands over a single character and a key's *name* otherwise, with one
    exception the engine makes: the space bar arrives as the name `space`, so it is
    handled by name rather than typed as itself. Backspace and Delete join two lines
    across a line break; an arrow at either end of the document does nothing rather than
    throwing, which would unmount the instance. The editor's region is given an explicit
    height, because a `Client` with none is as tall as what it draws and this module
    draws one row fewer than its region — a region sized by its own content, which
    settles at a single visible line. It opens only on a body it can hand back: the pane
    passes the whole body to the `Client` as props, and past the engine's bound the
    refusal lands on the **pane**, not the editor — so a body already over the bound is
    refused before the editor opens, and a body that *grows* past it closes the editor
    again, each pointing at Open in editor, which has no such bound. That is reachable
    here rather than hypothetical: `docs/runbooks/release-publishing.md` carries a
    108,718-character body. Save writes the file
    through the same path the fields form uses — the frontmatter byte for byte as it
    is, the body as the editor holds it — then runs `lore validate`; a rejection
    restores the previous bytes and shows lore's own message. Cancel closes it. The
    editor's scope is the operator's "lightweight": text, cursor, insert/delete and
    undo/redo, with **no highlighting while typing, no multi-cursor and no in-editor
    search**.
  - *Open in editor* is the other arm: it fills the prompt with the session's own shell
    escape to `$EDITOR` (`!${EDITOR:-vi} "<absolute path>"`) and sends nothing itself,
    so the person sends it and the harness's own rules apply; the pane re-reads and
    validates on refresh. It is the shell escape on every surface because the runtime
    has no Node — measured, so there is no `process.platform` to choose a desktop
    opener with — and `$EDITOR` is the person's own editor on their own machine.
  - The editing model is **vendored** `@codemirror/state` with its one dependency, in
    `hooks/vendor/`, because a hooks module can import only its own files and
    `claude-code` (see the engine constraint below). The vendor record there carries
    both versions, licenses and sha256 digests, and the one rewritten import specifier.
- **Ask Claude…** fills the prompt box with `Revise the document <id> in this
  repository: ` and sends nothing itself — the person sends it, so Claude's normal
  permissions and this repository's documentation rules apply.
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
opens the result in Read. The picker draws its first option as the chosen one before
anything has been chosen, so the vocabulary read writes that type into the draft: what
the picker shows is what Create submits, with no re-pick needed, and a draft the person
has already chosen in is left alone. The pane allocates no id of its own and passes no path: the
id it opens is whatever `lore new` returns, so it cannot mint ids that ignore other
refs — the create-path counterpart of the id-collision defect the quest-cli prototype
showed.

### The uncommitted-changes landing strip

Reads `git -c core.quotePath=false status --porcelain` in the repository root and keeps
the Markdown paths (renames resolved to the new name). The setting is deliberate and was
measured against git: without it a non-ASCII path arrives octal-escaped (`"caf\303\251.md"`)
and was dropped from the count, and with it only a backslash, a double quote or a control
byte is quoted at all — so the parser unquotes exactly those, ASCII escapes only. When any
exist, the pane shows the count and an
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
form, the uncommitted paths, and the inline editor's four keys — whether it is open,
**which document it is open on**, the text it last posted, and the revision the pane
bumps to make the editor adopt that text). The module imports it with `import type`,
so the file carries no runtime code. The editor's live text is *not* here: it is the
`Client` instance's own state, which survives the pane's redraws, and the pane's copy
is only what the editor posted for Save to write. The document key is what keeps those
two apart: the posted text is a *body*, and Save pairs it with the open document's
*file*, so an editor left open across a document change would write one document's text
into another's file. It is closed when the document changes, and `saveBody` refuses if
the pair ever disagrees.

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
  all resolves exit code `-1` and says "lore could not run (is it on PATH?)"; a run that
  is still going at the 30-second budget is killed by the engine and reported as the
  timeout it was. The result carries no flag for that and neither shape it can take says
  so on its own — a killed child's exit status is `1`, the same as a plain failure's, and
  the declaration has the call reject instead — so `runLore` measures the run against its
  own budget with `$.clock.now` on both the resolved and the rejected path.
- **A vocabulary that fails to read is a note, not a dead end.** Browse draws the
  concepts whenever the query succeeded; a failed `lore types` keeps the vocabulary
  already read and shows lore's own message in the pane's notice line.
- **Run lore's commands rather than reimplementing them.** Rename, supersede, link,
  unlink and the fields form all go through the CLI — the same reason the pane's
  `lore validate` step exists instead of a hand-rolled frontmatter check.

Three more constraints the inline editor was built against, each measured on Claude
Code 2.1.287 (2026-10-02) rather than read off a document:

- **Only the plugin's own files and `claude-code` can be imported into the module.**
  The validator's own words, for `import { marked } from "marked"`: *"a hooks module
  imports its own files by relative path and \"claude-code\", nothing else"*. A library
  used inside the module is therefore vendored source, never a dependency.
  **Corrected 2026-10-02 on an operator finding, recorded verbatim on opum-agent's
  `OPAG-1075` and read by ref:** the restriction binds the module's own JavaScript
  environment, not the mod. Direct imports of `node:` built-ins and `node_modules`
  packages are rejected there, but a **Node helper** run through `$.process.run([...])`
  or the streaming `$.process.spawn()` can import normal packages and Node built-ins —
  mods are not OS-sandboxed. The operator's shape is the one this module already has:
  *"Mods for Claude's UI, commands, and event hooks, with a Node process handling the
  package ecosystem and heavier application logic"* — the pane's UI lives in the module
  and its heavy work in the `lore` process it runs. A future surface with package-heavy,
  non-interactive work should take the helper route rather than vendor around it.
- **No Node, and no DOM.** A vendored file that throws when `document` is undefined
  stops the module loading with `no DOM in this runtime`, and one that throws on
  `process` says `no Node in this runtime`. So no DOM editor can run here, and there is
  no `process.platform` to branch on.
- **A `Client` element is read off the source.** `<Client module="./editor.tsx">` with
  the tag named `Client` and the path a string literal loads; the same element bound to
  another name does not — *"the plugin loaded no surface module (its hooks module builds
  no Client from a literal path)"*. The module keeps the tag's name and guards the
  surface that lacks the element (`Client` is on the terminal and desktop tables, not
  the vscode one).
- The vendored pair itself was proven by mounting before it was adopted: the two files
  load, create a state, apply a change and set a selection inside a mounted mod, and
  `claude plugin validate --strict` passes over them.

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

Measured on 2026-10-02 with the full-screen toggle in (`node scripts/mod-test.mjs` on
this checkout): `claude plugin validate --strict` exit 0 — its inventory holding the
`session.start` hook, the `command.run{command=lore}` registration,
`ui.render{Pane}`, the calls (`process.run`, `fs.read`, `fs.write`, `prompt.fill`,
`command.register`, `clock.every`, `ui.open`, `ui.panes`, `ui.resolve`, `store.get`,
`store.set`) and the five state keys — `claude plugin test` 48/48 pass (28 engine tests
in `tests/pane.test.tsx`, 20 unit tests in `tests/lore.test.ts`), and `tsc` against the
2.1.287 engine declaration exit 0. The typecheck is machine-local: the harness uses the
declaration the engine lays beside the stage, which names the build running the tests,
and reports **NOT TYPECHECKED** rather than implying one it could not run. Earlier
readings — 12/12 at `f71bed1c`, 16/16 before the editor, 22/22 before the editor-arm
review, 31/31 before the toggle — were the state at those points; a count here is a
reading, not a constant.

The engine tests cover: browse, open, Back and the Raw toggle (the first test mounts
on both the terminal and the desktop surface; the rest mount the terminal); search
submission and the `--across-refs --allow-partial` argv; the type filter; the fields
form saving through `lore validate`, asserting the path the bytes went to as well as
the bytes; a failed validation restoring the previous file to that same path and
showing lore's own message; New running `lore new` and opening the result, both with
the type picker chosen in and with it untouched; the rename and `lore sync` argvs; a
body link press opening the linked concept in-pane; and the inline editor end to end —
opening on the body, a key typed into the `Client` drawing in its region, the cursor's
own cell, Ctrl+Z taking the keystroke back, and Save writing the file through
`lore validate` with the frontmatter byte for byte, plus the rejected-save path
restoring the previous bytes to that same file, opening another document with the
editor open closing it rather than writing across documents, a body too large to hand
the editor being refused while the pane keeps drawing, a body that grows past that bound
closing the editor, and the editor's region carrying an explicit height; and the
full-screen toggle — the docked `columns` and inline `rows` a full request asks for, the
unsized request that returns the pane to normal, the `pane-mode` store round-trip across
a remount, the drag-wins hint and its suppression at the normal size, and the command's
`full` argument with its refusal of anything else — plus the 120-column split on Read
(asserted at 140, at exactly 120 and at 119 on the same document) and on Search, with
the two columns inspected in order so a swap cannot pass, and a control proving the split
is full mode's rather than any wide pane's. Unit tests cover
the pure helpers:
`patchFrontmatter` (replace, remove, insert, and the no-frontmatter refusal),
`replaceBody` (frontmatter preserved, body normalised, no-frontmatter refusal),
`bundleIdFor`, `internalHrefs`, `hasSection`, `groupByType`, `repoPathFor`'s
unconditional prefix, `searchArgv`'s `--` before a term, `failure`'s truncated-run
message, and the editor operations — insert, backspace and cursor motion across a
grapheme cluster (the vendored library's boundary arithmetic), the undo/redo ring and
its truncation by a new edit, the window following the cursor, the space bar typing a
space rather than the word `space`, no key's *name* ever being typed into the body, an
arrow at either end of the document doing nothing instead of throwing, Delete and
Backspace joining two lines across a line break, a key that cannot change anything
leaving the undo and redo rings alone, and a body past the engine's props or single-line
bound being refused while a body of ordinary short lines at the same length is not.

The cases added by the editor-arm review pass were each mutation-checked against its own
defect's shape — one mutant per fix, with the defective line restored — and each reddened
exactly the one test written for it, the rest staying green. Three of them are worth
naming because the result was not the obvious one. The review's own lead that the space
bar might insert the word `space` was first refuted from the engine's TypeScript
declaration and then confirmed from the 2.1.287 binary, where the dispatch that builds a
Client's key event maps it (`? "space" : o`). The cross-document close is defended twice,
so removing either defence alone leaves the suite green — only removing both reddens its
test, which therefore pins the behaviour rather than either guard. And removing either
size guard reddens its test with the engine's own words in the output — `opum-lore drew
nothing on the terminal surface: ui.render (Pane) refused` — which is the evidence that
the bound takes the whole pane, not just the editor.

What they do **not** cover, and this record therefore does not claim: pressing
Supersede, Link task or Unlink task; Ask Claude…; Open in editor; the landing strip's
button; the mobile and vscode branches; and the `session.start`/`command.run`
registrations beyond what `claude plugin validate`'s inventory reads. No test runs a
live `lore`: every command is mocked at the engine boundary, and no test runs a live
`$EDITOR` — the desktop arm is a prompt fill, which is asserted only by reading the
code.

## Decisions recorded here

The orchestrator's review of 2026-10-02 settled where design choices are recorded:
**ADRs only for decisions the operator actually makes**; the module's own choices go in
this Reference and on the task record. These are the module's own:

- **Repository-only scope in v1** — the operator's, and now decided:
  [ADR-0027](../adr/0027-the-lore-pane-reads-only-the-session-s-own-repository-bundle-in-v1-dec-133.md)
  (DEC-133 A, 2026-10-02). The pane resolves the session's git toplevel and reads and
  writes there. A fleet/workspace view — reading other repositories' bundles through a
  Lore workspace manifest — follows that decision, not an open question; `opum-family`
  currently fails to load because one member does not validate, which is `opum-doc`'s
  open item.
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
- **Body editing is decided — both arms** — and the operator's, not the module's:
  [ADR-0026](../adr/0026-the-lore-pane-s-body-editing-ships-a-lightweight-inline-editor-and-a-desktop-editor-action-dec-132.md)
  (DEC-132, 2026-10-02). A lightweight inline editor in a `Client` region — text,
  cursor, insert/delete, undo/redo, saving through the same `lore validate` path — plus
  a separate action that opens the document in the person's own editor. "Lightweight" is
  the operator's scoping: no highlighting while typing, no multi-cursor, no in-editor
  search. The same relay carried the instruction that decided how it is built: reuse a
  well-supported framework rather than building one — which the engine's own elements
  answer for Markdown, diff and highlighting, and a vendored, recorded CodeMirror state
  answers for the editing model. The arm is LCLI-664's sixth acceptance criterion.

## What is deliberately not here

- **No ADR of the module's own.** The operator's questions are recorded as their own
  ADRs, with their answers verbatim —
  [ADR-0026](../adr/0026-the-lore-pane-s-body-editing-ships-a-lightweight-inline-editor-and-a-desktop-editor-action-dec-132.md)
  for body editing,
  [ADR-0027](../adr/0027-the-lore-pane-reads-only-the-session-s-own-repository-bundle-in-v1-dec-133.md)
  for fleet view (both 2026-10-02), and
  [ADR-0028](../adr/0028-the-lore-pane-ships-as-its-own-mod-in-opum-lore-one-of-two-mods-each-in-the-plugin-it-drives-dec-136.md)
  for the mod's shape (DEC-136 A, two mods, one per plugin, answered 2026-10-02). The
  module's choices are the bullets above, and nothing here re-derives an operator
  decision or settles one locally.
- **No behaviour beyond the tests.** Anything the tests do not press is unclaimed
  above, and the pane's shape is described at its landing commit rather than at what
  the brief proposed.
