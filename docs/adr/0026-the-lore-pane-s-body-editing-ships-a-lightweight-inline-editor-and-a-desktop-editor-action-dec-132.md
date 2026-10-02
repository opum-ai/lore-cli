---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: The Lore pane's body editing ships a lightweight inline editor and a desktop-editor action (DEC-132)
tags:
  - lore-pane
  - mod
  - lcli-664
  - dec-132
summary: "DEC-132, decided neither A nor B: the pane gets a lightweight inline editor plus an action that opens the document in the full desktop editor, both saving through lore validate."
timestamp: 2026-10-02T18:35:14.199Z
status: stable
---

# ADR-0026: The Lore pane's body editing ships a lightweight inline editor and a desktop-editor action (DEC-132)

## Status

**Accepted — 2026-10-02 (DEC-132).** The operator answered neither of the options put to them, in
their own words, verbatim: **"both - lighjweight inline editor, option to open in full desktop
editor"** (the spellings are the operator's). Relayed by `opum-doc` as `ODOC-OP-2026-10-02-12`
(seq 158, 2026-10-02T18:25:27Z; acked 2026-10-02T18:26:04.519Z) and read here from opum-agent's own
tracker at `origin/dev`, `.quest/planning.json` DEC-132 (`accepted`), rather than taken from the
relay.

The same relay carried a first-party instruction on how this is built, verbatim: **"reuse exisitng
frameworks that are well supported instead of custom building where possible for the lore-cli mod"**
(spelling the operator's). It governs the inline editor, Markdown rendering, diffing and syntax
highlighting.

## Context

The Lore pane (LCLI-664) edits a document's frontmatter today through a fields form that validates
the written file with `lore validate` and restores the previous bytes when validation fails. The body
— the authored prose — had no editing path in the pane at all. The design brief's first open question
put two arms to the operator: **A**, hand the body to the person's own editor and re-read and validate
on refresh; **B**, build an in-pane editor in a `Client` region. Both arms were shaped by a measured
constraint: a Claude Code hooks module's **own JavaScript environment** runs with **no Node and no
DOM**, and imports **its own files by relative path and `claude-code`, nothing else** — so no npm
dependency can be installed into the module, and a library used there must be vendored source that
touches neither.

**Corrected 2026-10-02, on an operator finding, before this landed.** The constraint above binds the
hooks module's own JavaScript, not the mod as a whole. The operator inspected the 2.1.287 loader, ran a
working proof, and recorded the finding verbatim on `OPAG-1075` at opum-agent's `origin/dev` (the same
relay as DEC-136, `ODOC-OP-2026-10-02-14`, seq 160, 2026-10-02T21:44:03Z; read by ref): direct imports
of `node:` built-ins and of `node_modules` packages are rejected and relative ESM imports work, **but a
Node helper run through `$.process.run([...])` or the streaming `$.process.spawn()` can import normal
packages and Node built-ins** — mods are not OS-sandboxed. The operator's recommendation: *"Mods for
Claude's UI, commands, and event hooks, with a Node process handling the package ecosystem and heavier
application logic."*

That changes no choice below, and the reason is the measurement the decision already stood on rather
than a preference. The inline editor is interactive and drawn in the pane, so its text model runs in
the module's own environment — a helper round trip per keystroke is not a design this pane takes — and
the vendored pair is DOM-free and Node-free by construction, which is exactly what fits there. The
heavier logic already sits behind a process: the module runs the `lore` CLI through `$.process.run`,
which is the helper pattern the operator names. What the correction fixes is the *scope* of the claim,
not the pick; a future surface with package-heavy, non-interactive work has the helper route open to it
and should take it.

## Decision

**Both arms ship, with the inline editor scoped as "lightweight".** The pane gains:

- a **lightweight inline editor** on the Read tab: the body as text with a cursor, insert and delete,
  and undo and redo, drawn with the engine's own elements inside a `Client` region, saving through the
  same `lore validate` path the fields form uses and restoring the previous bytes when validation
  fails;
- a **desktop-editor action**: a separate action that opens the document in the person's own editor
  (the desktop file opener, or the session's shell escape to `$EDITOR` in the terminal), sharing that
  same validate path.

"Lightweight" is the operator's scoping, and the boundary is: **text, cursor, insert/delete and
undo/redo.** Not the full-featured `Client`-region editor option B described — **no highlighting while
typing, no multi-cursor, and no in-editor search.** This reading was reported to the orchestrator
before any editor code was written and stands; a genuinely ambiguous "lightweight" was to come back
as an A/B rather than be settled locally.

**The reuse instruction resolved by measurement, not preference:**

- **Markdown rendering, diffing and syntax highlighting use the engine's own elements** — the
  `Markdown` element (which every surface draws as it draws an assistant reply, carrying link presses)
  and the `Code` element (its own highlighter: `language` for syntax highlighting, and
  `format: 'diff'`, which reads text as unified-diff hunks and draws gutters, markers and add/remove
  colouring). No library is vendored for any of the three; the host engine is the well-supported
  framework.
- **The editing model is `@codemirror/state` 6.7.6 with its one dependency
  `@marijn/find-cluster-break` 1.0.4, vendored into the plugin.** Measured before use: a bare
  specifier is refused by the engine's validator in its own words ("a hooks module imports its own
  files by relative path and `claude-code`, nothing else"); a vendored file imported by relative path
  is accepted; a module touching `document` fails to load ("no DOM in this runtime") and one touching
  `process`/`require` fails the same way; and those two vendored files load, run and validate inside a
  mounted mod. DOM editors (CodeMirror's view, Monaco, ProseMirror) are excluded by the no-DOM
  measurement and Node TUIs by the no-Node one. What the pick buys over a hand-rolled buffer is a
  battle-tested document, selection and undo model, including grapheme-cluster-correct cursor
  arithmetic — the class of defect a purpose-built buffer gets wrong.

## Consequences

- The pane's Read tab carries the editor as a `Client` surface module; `Client` is on the terminal and
  desktop surfaces, so the editor is too, and the mobile branch keeps saying the pane needs one of
  those.
- Both arms write through one validated path: `lore validate` on the written file, previous bytes kept
  on failure, `lore`'s own message shown. Nothing reimplements frontmatter or link handling.
- Vendoring carries a duty that is now part of the module layout: the two files ship with their
  license texts and a record naming each file's version, license and sha256, **marking the one
  rewritten import specifier as a patch**, so a re-vendor reapplies it. Both licenses (MIT) permit
  redistribution inside this public package.
- A hand-built editing buffer is now explicitly ruled out, as is adding a highlighting library to the
  editor (highlight.js, Prism). The engine's `Code` element already highlights in Read, read-only.
- The editor's own scope is bounded by tests rather than by intention: what the module's engine tests
  do not press is not claimed.
