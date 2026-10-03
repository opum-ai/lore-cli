// LCLI-664. The Lore pane: a Claude Code pane over the repository's
// documentation bundle, driven entirely by the lore CLI (stdout only;
// warnings on stderr are read solely to explain a failure). Browse, Read
// (rendered and raw), Search and New mirror the design brief in opum-doc,
// `docs/reference/lore-mod-design-brief.md`; the repository is the session's
// own, resolved as the git toplevel, and a fleet/workspace view is
// deliberately out of v1 (operator question Q2). Body editing ships whichever
// arm the operator selects (Q1); until that is relayed the pane hands the
// person Claude-assisted revision and the fields form.
//
// Every `$.noun.method(...)` call lives in this file: the engine's validator
// refuses a noun of `$` passed across an import, so ./lore receives plain
// values (an argv to run, a run's result) and answers with parsed shapes.

import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, UiOpenResult, UiPane } from "claude-code";

import type { Catalog, DocState, Edits, PaneMode, PaneState, View } from "../types";
import type { Outcome, Run } from "./lore";
import {
  BODY_CAP,
  actionArgv,
  actionVerb,
  bundleIdFor,
  cap,
  editorFits,
  failure,
  groupByType,
  hasSection,
  internalHrefs,
  isCapped,
  newArgv,
  parseBrowse,
  parseCreated,
  parsePorcelain,
  parseRead,
  parseSearch,
  parseTypes,
  parseValidate,
  patchFrontmatter,
  queryArgv,
  replaceBody,
  requiredSectionsFor,
  searchArgv,
} from "./lore";

// The pane's ID, which is not what opens it: the pane has no slash command (LCLI-667 --
// the engine's `lore` skill owns that name, so a command of the same name is refused), and
// `mcp__opum-lore__dashboard` below is its entry point. The id keeps its older spelling
// because it is what `$.ui.open`, the store and `$.state` are keyed by: renaming it would
// lose an open pane and a preference saved before the rename.
const PANE = "lore-pane";
const REFRESH_MS = 30_000;
const TIMEOUT_MS = 30_000;
const ROW_CAP = 120;

// ── The full-screen toggle (LCLI-666) ─────────────────────────────────────────

/** Where the surface seated the pane, as the `Pane` render props carry it. */
type Placement = "dock" | "inline";

/** The `$.store` key holding the remembered full-or-normal choice (a `PaneMode`). */
const MODE_KEY = "pane-mode";

/**
 * Opens the pane the way every caller here must, and records what the engine answered.
 *
 * Unsized and without `focus`: "each open sets it anew" clears whatever size was standing,
 * so an open of a full-mode pane raises the one restoration ask the next draw consumes
 * (`pendingAsk`) -- DEC-154 rule 2 as amended puts the ask per toggle, or per open that
 * cleared the size, and never per resize or redraw -- and no caller here may take the
 * keyboard from a person who might be typing.
 *
 * The record it leaves is `pane.isWaiting`, and it is the BAND's reading wherever the
 * engine's listing cannot be had (LCLI-672): a refused open is what the band exists to
 * answer, and this is that refusal kept. It is only a record of the last open, so it is
 * never the first choice -- `paneStanding` is, because a widened terminal seats the pane
 * with no open to hear about it, which a record cannot notice and a listing can.
 */
async function openPane($: EngineInterface): Promise<UiOpenResult> {
  const { mode } = await read($, pane);
  // Raise the restoration ask a full-mode open owes -- and never LOWER one already
  // standing. This read can be stale against a toggle whose write has not landed yet
  // (measured, LCLI-675 review F1: a tool call racing the person's `z` read `normal`,
  // nulled the ask, and left the pane full-mode and unsized), and a standing ask may
  // carry the person's keyboard intent, which this open knows nothing about. Every mode
  // change assigns its own ask and the draws that spend one are mode-guarded, so an ask
  // this open does not need cannot outlive the next toggle.
  if (pendingAsk === null && mode === "full") {
    pendingAsk = { mode: "full", byPerson: false };
  }
  const asked = await $.ui.open({ id: PANE, title: "Lore" });
  await update($, pane, (state) => ({ ...state, isWaiting: asked.isPlaced === false }));

  return asked;
}

/**
 * The columns the engine's own dock clamp keeps clear, from DEC-154 rule 2.
 *
 * A docked request is clamped to `[24, cols - 24]` (read from the 2.1.288 build,
 * LCLI-674), so the full ask IS that clamp's ceiling: anything less asks for less
 * than the surface allows, and the ceiling is what makes a short grant readable as
 * a width the person holds rather than a clamp.
 */
const DOCK_FLOOR_COLUMNS = 24;

/**
 * The rows the engine keeps clear of an inline pane, from DEC-154 rule 1: 8 for the
 * prompt and 3 of transcript, so an inline full ask is `rows - 11`.
 *
 * Measured, not estimated (LCLI-674): the engine caps an inline pane at
 * `max(rows / 3, rows - 11)` on the main screen, and the first design's `rows - 6`
 * asked for rows the engine never grants. The request stays a request, and a grant
 * a few rows below the cap is accepted, because the frame and the pane's own
 * controls take the difference.
 */
const PROMPT_FLOOR_ROWS = 8;
const TRANSCRIPT_PEEK_ROWS = 3;

/**
 * The cells between the size a request asks for and the size the body measures.
 *
 * `columns` and `rows` are the pane's own size; `bodyColumns` is "cells across
 * the body, inside the frame". One slack covers the frame and the chrome a
 * surface draws around the body, so a pane that got what it asked for is not
 * read as short of it -- and the tool's answer calls a size within the same
 * slack "the full size" (DEC-154 rule 4).
 */
const SIZE_SLACK = 4;

/**
 * The line a full docked pane shows while it drew short of its ask.
 *
 * DEC-154 rule 3: a size the person dragged is theirs, the module never edits
 * `~/.claude.json` or works around it, and the pane says so plainly rather than
 * showing a generic held hint. The width named is the pane's own -- the body plus
 * the frame column LCLI-674 measured (79 body cells under an 80-wide pane) -- which
 * is the number the person set. The classification is the design's own and Quest's
 * board's (seq 234): a docked full pane more than `SIZE_SLACK` short of its ask is at
 * a kept width, whatever raised the ask.
 */
const keptWidthLine = (paneColumns: number) =>
  `Width kept at ${paneColumns} (you set it): drag the pane edge to change`;

// ── The dashboard tool (LCLI-668) ─────────────────────────────────────────────

/** The tool's own name, which is what `$.tool.register` declares. */
const TOOL_NAME = "dashboard";

/**
 * The tool as the engine lists it to the model: `ToolSpec` spells a declared name
 * `mcp__<plugin>__<name>`, and the plugin's name is `opum-lore` in
 * `.claude-plugin/plugin.json`. The hook that serves the tool is matched at register
 * time, before any registration has returned a name, so the spelling lives here and
 * both sides are built from the one pair of constants.
 */
const TOOL = `mcp__opum-lore__${TOOL_NAME}` as const;

/**
 * The tool's listed description.
 *
 * One or two sentences, and no more: the description is listed to Claude in every
 * session that loads the mod, so it is a standing cost on every prompt (design of
 * record, opum-doc `docs/reference/pane-dashboard-tool-design.md` at dfde45e).
 */
const TOOL_DESCRIPTION =
  "Open the Lore pane in this session: browse, read, search and create this repository’s documentation. " +
  "`doc` opens a concept on the Read tab, `query` searches on the Search tab, `full` asks for the full size, " +
  "and the pane never takes the keyboard.";

/** What the tool takes: every field optional, so a bare call opens the pane as it stands. */
const TOOL_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    doc: { type: "string", description: "A concept id to open on the Read tab." },
    query: { type: "string", description: "Text to search the bundle for, on the Search tab." },
    full: { type: "boolean", description: "Ask for the pane's full size." },
  },
  additionalProperties: false,
};

/**
 * The body columns from which the pane draws its list in a left column and the
 * document in the right one, instead of stacked (design: "at least 120 body
 * columns", the same threshold the Quest board splits at). Below it -- and outside
 * full mode, where the pane is whatever size the surface's share gave it -- both
 * tabs keep the stacked layout.
 */
const SIDE_BY_SIDE_COLUMNS = 120;

// ── The band above the prompt (LCLI-672) ──────────────────────────────────────

/**
 * The one line the band above the prompt shows while the pane is open and undrawn.
 *
 * It exists because of a rule measured rather than read (LCLI-672 note, Claude Code
 * 2.1.288): an open nobody ASKED for by hand waits undrawn below the engine's floor -- 144
 * terminal columns, or 110 for an id the person has opened before -- and a model's tool
 * call is one of those. A press is not: the engine places an open asked by a Button at any
 * width, which is the one door onto a pane the model opened on a narrow terminal. So the
 * line says what is ready and the Button seats it, and both are gone once it is drawn.
 *
 * The line carries the focus step too (`BAND_HINT`), because the Button's letter hotkey is
 * not reachable from an empty composer the way a digit is: `o` presses it only once ctrl+x
 * tab has given the band the keys, where a click needs no focus at all. A digit would
 * collide with other bands' Buttons and with the pane's own link-list hotkeys, so the
 * keystroke is written down rather than changed (opum-doc seq 212, ODOC-OP-2026-10-03-43).
 */
const BAND_TEXT = "Lore pane ready";

/** The focus step, as the band prints it after the Button -- see `BAND_TEXT`. */
const BAND_HINT = "(ctrl+x tab, o)";

/** One line of the bundle list: a type's heading, or a concept that opens. */
type BrowseRow =
  | { kind: "group"; key: string; type: string; count: number }
  | { kind: "row"; key: string; id: string; title: string };

const view = atom({ plugin: "opum-lore", key: "view" } as const, {
  tab: "browse",
  root: null,
  query: "",
  typeFilter: "",
  tagFilter: "",
  acrossRefs: false,
  selectedId: null,
  history: [],
  isRaw: false,
  action: null,
  actionValue: "",
  isLoading: false,
  error: null,
  notice: null,
} satisfies View);

const catalog = atom({ plugin: "opum-lore", key: "catalog" } as const, {
  concepts: [],
  types: [],
  hits: [],
} satisfies Catalog);

const doc = atom({ plugin: "opum-lore", key: "doc" } as const, { concept: null } satisfies DocState);

const edits = atom({ plugin: "opum-lore", key: "edits" } as const, {
  isWriting: false,
  draft: { type: "", title: "", summary: "", tags: "" },
  fields: null,
  uncommitted: [],
  bodyEditing: false,
  bodyDocId: null,
  bodyText: "",
  bodyRevision: 0,
} satisfies Edits);

const pane = atom({ plugin: "opum-lore", key: "pane" } as const, {
  mode: "normal",
  isWaiting: false,
} satisfies PaneState);

/**
 * The one ask a toggle owes, waiting for a draw that can build it; null when none is owed.
 *
 * A draw is the only place that knows `e.viewport`, so a sized request is built there --
 * but a draw is not an event, and DEC-154 rule 2 as amended makes the ask ONCE per toggle
 * (a person's `z`, a tool call carrying `full`, or a stored full mode on its first render)
 * and never on a resize or a redraw: re-deriving it from each render would chase the
 * pane's own new width. An open that cleared the size (a tool call, the band's press, a
 * session start) raises the same one ask, because "each open sets it anew" leaves a full
 * pane at the surface's share until something asks again.
 *
 * `byPerson` rides with it because `focus` does: a person asking for a size gets a pane
 * that may take the keyboard; a restored or tool-raised ask never does. The ask is
 * carried as the MODE that was raised for rather than a bare flag (LCLI-668 review F5):
 * the draw that spends it has to be the one applying that mode, and a draw with nothing
 * to ask leaves the ask standing for the draw that does, instead of spending it on the
 * way past.
 */
let pendingAsk: { mode: PaneMode; byPerson: boolean } | null = null;

/**
 * The numbers of the latest completed draw, for the dashboard tool's answer.
 *
 * DEC-154 rule 4: the tool reports the DRAWN size, never the asked one, and "the full
 * size" only when the draw came within `SIZE_SLACK` of its ask. A tool call returns after
 * an unsized open, often before the restore draw has run, so this is the most recent
 * render as of the answer -- and a missing record, or one of another mode, is what the
 * answer honestly calls "full requested".
 */
let lastDraw: {
  mode: PaneMode;
  placement: Placement;
  wanted: number | null;
  drawn: number;
} | null = null;

// ── The call sites ────────────────────────────────────────────────────────────

/**
 * Whether the run was still going when the engine's timeoutMs budget ran out.
 *
 * The engine enforces that budget by killing the child, and neither shape it can
 * take says so: the declaration has the call reject, the review note has it read
 * as exit 1, and the result carries no field either way. Elapsed time is the one
 * signal both shapes carry, so the run is measured against its own budget on the
 * way out of `runLore`, resolved or rejected (LCLI-664 review F8).
 */
async function timedOutMs($: EngineInterface, startedAt: number): Promise<number | null> {
  const elapsed = (await $.clock.now()) - startedAt;

  return elapsed >= TIMEOUT_MS ? TIMEOUT_MS : null;
}

/** Runs `lore <argv>` in the repository root; a command that cannot start resolves code -1. */
async function runLore($: EngineInterface, root: string | null, argv: readonly string[]): Promise<Run> {
  const startedAt = await $.clock.now();
  try {
    const result = await $.process.run(["lore", ...argv], {
      ...(root ? { cwd: root } : {}),
      timeoutMs: TIMEOUT_MS,
    });
    const timed = await timedOutMs($, startedAt);

    return {
      code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.isStdoutTruncated || result.isStderrTruncated,
      ...(timed === null ? {} : { timedOutMs: timed }),
    };
  } catch (error) {
    const timed = await timedOutMs($, startedAt);

    return {
      code: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      ...(timed === null ? {} : { timedOutMs: timed }),
    };
  }
}

/** The git toplevel of the session's cwd, or null outside a repository. */
async function resolveRoot($: EngineInterface): Promise<string | null> {
  try {
    const result = await $.process.run(["git", "rev-parse", "--show-toplevel"], {
      timeoutMs: TIMEOUT_MS,
    });

    return result.exitCode === 0 ? result.stdout.trim() || null : null;
  } catch {
    return null;
  }
}

/** The view's root, resolved on first need (session.start may not have run). */
async function ensureRoot($: EngineInterface): Promise<string | null> {
  const current = (await read($, view)).root;
  if (current) {
    return current;
  }
  const root = await resolveRoot($);
  if (root) {
    await setView($, { root });
  }

  return root;
}

/** The file exactly as on disk, for the Raw view; null when it cannot be read. */
async function readFileText($: EngineInterface, root: string | null, docPath: string): Promise<string | null> {
  if (!root || !docPath) {
    return null;
  }
  try {
    return await $.fs.read(`${root}/${docPath}`);
  } catch {
    return null;
  }
}

async function writeFileText($: EngineInterface, root: string | null, docPath: string, text: string): Promise<Outcome> {
  if (!root || !docPath) {
    return { ok: false, error: "No repository root to write into." };
  }
  try {
    await $.fs.write(`${root}/${docPath}`, text);

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Uncommitted Markdown paths in the repository, for the landing strip. */
async function uncommittedPaths($: EngineInterface, root: string | null): Promise<string[]> {
  if (!root) {
    return [];
  }
  try {
    // -c core.quotePath=false keeps a non-ASCII path raw instead of octal-escaping
    // it, so parsePorcelain only has git's ASCII escapes left to unquote.
    const result = await $.process.run(["git", "-c", "core.quotePath=false", "status", "--porcelain"], {
      cwd: root,
      timeoutMs: TIMEOUT_MS,
    });

    return result.exitCode === 0 ? parsePorcelain(result.stdout) : [];
  } catch {
    return [];
  }
}

// ── The pane's size ───────────────────────────────────────────────────────────

/**
 * The size a full-screen request asks for, or null when there is nothing to ask from.
 *
 * `PaneOpenArgs` takes a size per placement: docked panes in `columns`, inline ones in
 * `rows`. DEC-154 rule 1 (inline) asks `rows - 11`; rule 2 as amended (dock) recovers the
 * TERMINAL width from one render: `viewport.columns` is the transcript column beside a
 * docked pane, not the terminal, and the pane's `bodyColumns` are the cells inside its
 * frame -- so terminal = transcript + drawn body + 1, and that last column is the pane's
 * frame edge, the divider at the transcript's own (LCLI-674 measured 79 body cells under
 * an 80-wide pane at a 160-column terminal) -- and asks for all of it less the engine's
 * 24-column floor. A surface that was never measured, or one too small to hold the floor
 * and a pane both, has no size to request.
 */
function wantedSize(placement: Placement, columns: number, rows: number, drawn: number): number | null {
  if (placement === "dock") {
    if (columns <= 0 || drawn <= 0) {
      return null;
    }
    const size = columns + drawn + 1 - DOCK_FLOOR_COLUMNS;

    return size > 0 ? size : null;
  }
  const size = rows - PROMPT_FLOOR_ROWS - TRANSCRIPT_PEEK_ROWS;

  return size > 0 ? size : null;
}

/**
 * Asks the surface for the pane, sized when there is a size to ask for.
 *
 * `focus` only when the person asked (a request, not a grant either way: the
 * surface hands the pane the keyboard only over an empty composer), and
 * `closeOnEscape` is never passed -- that pair is what would make the pane a
 * dialog rather than a pane. The key is left OUT rather than set false, so what
 * the module asked for is what the open carries.
 */
async function requestPane(
  $: EngineInterface,
  placement: Placement,
  wanted: number | null,
  focus: boolean,
): Promise<void> {
  const asked = focus ? { focus: true as const } : {};
  if (wanted === null) {
    await $.ui.open({ id: PANE, title: "Lore", ...asked });

    return;
  }
  await $.ui.open({
    id: PANE,
    title: "Lore",
    ...asked,
    ...(placement === "dock" ? { columns: wanted } : { rows: wanted }),
  });
}

/**
 * Leaves the pane at `mode`, in `$.state` and in the store.
 *
 * `pendingAsk` is deliberately NOT set here: the person's own toggle raises it itself,
 * and a size nobody asked for -- a restored one, or the dashboard tool asking for
 * `full` together with the unsized open that follows -- must not take the keyboard from
 * the prompt (the open raises the ask without `byPerson`, in `openPane`). The size
 * itself is asked for by the next draw, which is the only place that knows `e.viewport`;
 * this leaves the choice where a draw will find it. The store write is best-effort: a
 * store that refuses loses the memory of the choice, which is not a reason to refuse
 * the change.
 */
async function setPaneMode($: EngineInterface, mode: PaneMode): Promise<void> {
  await update($, pane, (state) => ({ ...state, mode }));
  try {
    await $.store.set(MODE_KEY, mode);
  } catch {
    // The pane changes size either way; only the next session's memory of it is lost.
  }
}

/**
 * Flips the pane between its normal size and the largest the surface allows.
 *
 * `pendingAsk` leaves the person's intent beside the change -- they pressed the
 * key, so the pane it produces may take the keyboard.
 */
async function togglePane($: EngineInterface): Promise<PaneMode> {
  const next: PaneMode = (await read($, pane)).mode === "full" ? "normal" : "full";
  pendingAsk = { mode: next, byPerson: true };
  await setPaneMode($, next);

  return next;
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function setView($: EngineInterface, patch: Partial<View>): Promise<void> {
  await update($, view, (current) => ({ ...current, ...patch }));
}

/**
 * The New tab's type picker draws its first option as the chosen one before
 * anything has been chosen, so a draft left at "" blanks the type's
 * required-sections hint and makes Create refuse a form that visibly names a
 * type -- "A type and a title are required." with no `lore new` sent at all
 * (LCLI-664 review F1). The vocabulary read is the first moment the default is
 * knowable, so it is written into the draft here; a draft the person has
 * already chosen in is left alone.
 */
async function seedDraftType($: EngineInterface, types: readonly { name: string }[]): Promise<void> {
  const first = types[0]?.name ?? "";
  if (!first) {
    return;
  }
  await update($, edits, (e) => (e.draft.type ? e : { ...e, draft: { ...e.draft, type: first } }));
}

async function refresh($: EngineInterface): Promise<void> {
  const root = await ensureRoot($);
  const current = await read($, view);
  await setView($, { isLoading: true });
  if (current.tab === "search") {
    const [foundRun, typesRun] = await Promise.all([
      runLore($, root, searchArgv(current)),
      runLore($, root, ["types", "--json"]),
    ]);
    const found = parseSearch(foundRun);
    const types = parseTypes(typesRun);
    if (found.ok) {
      await update($, catalog, (c) => ({ ...c, hits: found.hits, types: types ?? c.types }));
      await seedDraftType($, types ?? []);
      await setView($, { isLoading: false, error: null });
    } else {
      await setView($, { isLoading: false, error: found.error });
    }

    return;
  }
  const [query, types] = await Promise.all([
    runLore($, root, queryArgv(current)),
    runLore($, root, ["types", "--json"]),
  ]);
  const browse = parseBrowse(query, types);
  if (browse.ok) {
    // A failed vocabulary read leaves the concepts browsable: the note says why
    // the type list is missing and the vocabulary already read is kept (F8).
    const vocabulary = browse.types ?? (await read($, catalog)).types;
    await update($, catalog, (c) => ({ ...c, concepts: browse.concepts, types: vocabulary }));
    await seedDraftType($, vocabulary);
    await setView($, { isLoading: false, error: null, notice: browse.typesNote ?? null });
  } else {
    await setView($, { isLoading: false, error: browse.error });
  }
}

/**
 * Loads one concept into the pane and leaves it open on the Read tab.
 *
 * The outcome is returned rather than only drawn: the person's own presses read it
 * as "nothing happened, the pane says why", but the dashboard tool has to report a
 * bad id back to the model, and it can only do that if the read's own answer reaches
 * its caller (LCLI-668).
 */
async function loadConcept($: EngineInterface, id: string, patch: Partial<View> = {}): Promise<Outcome> {
  const root = await ensureRoot($);
  await setView($, { isLoading: true });
  const [readRun, tasksRun] = await Promise.all([
    runLore($, root, ["read", id, "--json"]),
    runLore($, root, ["tasks", id, "--json"]),
  ]);
  const result = parseRead(readRun, tasksRun, id);
  if (!result.ok) {
    await setView($, { isLoading: false, error: result.error });

    return { ok: false, error: result.error };
  }
  const raw = await readFileText($, root, result.doc.repoPath);
  await update($, doc, () => ({ concept: { ...result.doc, raw } }));
  // The open body editor belongs to ONE document. Left open across a concept change,
  // `bodyText` — a body — would sit beside the NEW document's file, and Save would
  // write one document's text into the other's file. Closing it here covers every way
  // the open document changes: Browse, Search, a link press, Back/forward, Refresh.
  await update($, edits, (e) =>
    e.bodyEditing && e.bodyDocId !== result.doc.id ? { ...e, bodyEditing: false, bodyDocId: null, bodyText: "" } : e,
  );
  await setView($, {
    isLoading: false,
    error: null,
    selectedId: id,
    isRaw: false,
    action: null,
    actionValue: "",
    ...patch,
  });

  return { ok: true };
}

/** Opens one concept on the Read tab, carrying the back history; see `loadConcept`. */
async function openConcept($: EngineInterface, id: string): Promise<Outcome> {
  const current = await read($, view);
  const history =
    current.selectedId && current.selectedId !== id
      ? [...current.history, current.selectedId].slice(-50)
      : current.history;

  return await loadConcept($, id, { tab: "read", history });
}

async function goBack($: EngineInterface): Promise<void> {
  const current = await read($, view);
  const previous = current.history[current.history.length - 1];
  if (!previous) {
    return;
  }
  await loadConcept($, previous, { tab: "read", history: current.history.slice(0, -1) });
}

async function showTab($: EngineInterface, tab: View["tab"]): Promise<void> {
  await setView($, { tab, error: null, notice: null });
  if (tab === "browse" || tab === "search" || tab === "new") {
    await refresh($);
  }
}

/** A submit that changes the view before it reads it, so the read is never stale. */
async function submitWith($: EngineInterface, patch: Partial<View>): Promise<void> {
  await setView($, patch);
  await refresh($);
}

async function toggleAcross($: EngineInterface): Promise<void> {
  const current = await read($, view);
  await setView($, { acrossRefs: !current.acrossRefs });
  await refresh($);
}

async function pickFilter($: EngineInterface, key: "typeFilter", value: string): Promise<void> {
  await setView($, { [key]: value });
  await refresh($);
}

async function countUncommitted($: EngineInterface): Promise<void> {
  const root = await ensureRoot($);
  const uncommitted = await uncommittedPaths($, root);
  await update($, edits, (e) => ({ ...e, uncommitted }));
}

async function openFields($: EngineInterface): Promise<void> {
  const { concept } = await read($, doc);
  if (!concept) {
    return;
  }
  await update($, edits, (e) => ({
    ...e,
    fields: {
      type: concept.type,
      title: concept.title,
      summary: concept.summary ?? "",
      tags: concept.tags.join(", "),
      status: concept.status ?? "",
    },
  }));
}

async function saveFields($: EngineInterface): Promise<void> {
  const current = await read($, view);
  const { concept } = await read($, doc);
  const { fields } = await read($, edits);
  if (!concept || !fields || !current.root) {
    return;
  }
  if (!concept.raw) {
    await setView($, { error: "The file has not been read yet." });

    return;
  }
  const tags = fields.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const next = patchFrontmatter(concept.raw, {
    title: fields.title,
    summary: fields.summary.trim() ? fields.summary.trim() : null,
    tags,
    status: fields.status.trim() ? fields.status.trim() : null,
  });
  if (next === null) {
    await setView($, { error: "The file carries no frontmatter to edit." });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: true }));
  const wrote = await writeFileText($, current.root, concept.repoPath, next);
  if (!wrote.ok) {
    await update($, edits, (e) => ({ ...e, isWriting: false }));
    await setView($, { error: `Could not write ${concept.repoPath}: ${wrote.error}` });

    return;
  }
  const checked = parseValidate(await runLore($, current.root, ["validate", concept.repoPath, "--json"]));
  if (!checked.ok) {
    // A failed validation keeps the previous file: the bytes read before the
    // edit go back, and lore's own message is what the person sees.
    const restored = await writeFileText($, current.root, concept.repoPath, concept.raw);
    await update($, edits, (e) => ({ ...e, isWriting: false }));
    await setView($, {
      error: restored.ok
        ? checked.error
        : `${checked.error} (and restoring the previous file failed: ${restored.error})`,
    });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: false, fields: null }));
  await setView($, { notice: "Saved and validated.", error: null });
  await loadConcept($, concept.id);
  await countUncommitted($);
}

/**
 * Opens the inline body editor on the open document's body. The revision bump makes
 * the editor adopt `concept.body` as it stands — it is the pane saying "this is the
 * text", as against the editor's own keystrokes, which the pane takes as given.
 */
async function beginBodyEdit($: EngineInterface): Promise<void> {
  const { concept } = await read($, doc);
  if (!concept) {
    return;
  }
  // Refused BEFORE the editor opens, because the failure is not the editor's: the pane
  // passes the whole body to the `Client` as props, and a body past the engine's bound
  // makes the engine refuse the PANE's render ("opum-lore drew nothing on the terminal
  // surface") rather than the editor's. `Open in editor` has no such bound.
  if (!editorFits(concept.body)) {
    await setView($, {
      error: `${concept.path} is too large for the inline editor (${concept.body.length} characters). Use Open in editor, which has no such limit.`,
      notice: null,
    });

    return;
  }
  await update($, edits, (e) => ({
    ...e,
    bodyEditing: true,
    bodyDocId: concept.id,
    bodyText: concept.body,
    bodyRevision: e.bodyRevision + 1,
  }));
  await setView($, { error: null, notice: null });
}

async function cancelBodyEdit($: EngineInterface): Promise<void> {
  await update($, edits, (e) => ({ ...e, bodyEditing: false, bodyDocId: null, bodyText: "" }));
}

/** The inline editor's Save: the same write, validate and restore path as the fields form. */
async function saveBody($: EngineInterface): Promise<void> {
  const current = await read($, view);
  const { concept } = await read($, doc);
  const { bodyText, bodyDocId } = await read($, edits);
  if (!concept || !current.root) {
    return;
  }
  // Defence in depth behind `loadConcept`: the editor holds a BODY and the write pairs
  // it with the open document's FILE. When those are not the same document, writing
  // would put one document's body into another document's file — so this refuses.
  if (bodyDocId !== concept.id) {
    await update($, edits, (e) => ({ ...e, bodyEditing: false, bodyDocId: null, bodyText: "" }));
    await setView($, { error: "The editor was open on another document, so nothing was written. Open it again." });

    return;
  }
  if (!concept.raw) {
    await setView($, { error: "The file has not been read yet." });

    return;
  }
  const next = replaceBody(concept.raw, bodyText);
  if (next === null) {
    await setView($, { error: "The file carries no frontmatter to keep." });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: true }));
  const wrote = await writeFileText($, current.root, concept.repoPath, next);
  if (!wrote.ok) {
    await update($, edits, (e) => ({ ...e, isWriting: false }));
    await setView($, { error: `Could not write ${concept.repoPath}: ${wrote.error}` });

    return;
  }
  const checked = parseValidate(await runLore($, current.root, ["validate", concept.repoPath, "--json"]));
  if (!checked.ok) {
    const restored = await writeFileText($, current.root, concept.repoPath, concept.raw);
    // No revision bump here, deliberately. `bodyText` still holds the person's own
    // text and the editor's state is already that text, so there is nothing to adopt —
    // and adopting would re-create the instance, parking the cursor at the end and
    // dropping the redo ring, exactly while they are fixing what validation flagged.
    await update($, edits, (e) => ({ ...e, isWriting: false }));
    await setView($, {
      error: restored.ok
        ? checked.error
        : `${checked.error} (and restoring the previous file failed: ${restored.error})`,
    });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: false, bodyEditing: false, bodyDocId: null, bodyText: "" }));
  await setView($, { notice: "Saved and validated.", error: null });
  await loadConcept($, concept.id);
  await countUncommitted($);
}

/**
 * The desktop-editor action: the other half of DEC-132. Nothing of the editor is
 * reimplemented here — the document is handed to the person's own tool, and the pane
 * re-reads and validates when it comes back (the Refresh button, or the 30-second
 * refresh). On the terminal that is the session's own shell escape to `$EDITOR`,
 * filled into the prompt rather than run, so the person sends it; on the desktop
 * surface it is the platform's file opener.
 */
async function openInEditor($: EngineInterface): Promise<void> {
  const current = await read($, view);
  const { concept } = await read($, doc);
  if (!concept || !current.root) {
    return;
  }
  const path = `${current.root}/${concept.repoPath}`;
  // The shell escape on every surface, rather than a platform opener chosen in code:
  // the runtime has no Node (measured — `process` is undefined), so there is no
  // `process.platform` to branch on, and `$EDITOR` resolves on the person's own
  // machine to the editor they actually use. It is filled, not submitted: the person
  // sends it, so the harness's own shell-escape rules and permissions apply.
  const editor = "${EDITOR:-vi}";
  await $.prompt.fill({ text: `!${editor} "${path}"`, mode: "replace" });
  await setView($, { notice: `Sent ${concept.repoPath} to your editor; refresh when you are done.` });
}

async function createNew($: EngineInterface): Promise<void> {
  const current = await read($, view);
  const { draft } = await read($, edits);
  if (!draft.type.trim() || !draft.title.trim()) {
    await setView($, { error: "A type and a title are required." });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: true }));
  const result = parseCreated(await runLore($, current.root, newArgv(draft)));
  await update($, edits, (e) => ({ ...e, isWriting: false }));
  if (!result.ok) {
    await setView($, { error: result.error });

    return;
  }
  await setView($, { notice: `Created ${result.id ?? draft.title}.`, error: null });
  await update($, edits, (e) => ({
    ...e,
    draft: { type: draft.type, title: "", summary: "", tags: "" },
  }));
  if (result.id) {
    await openConcept($, result.id);
  }
  await refresh($);
  await countUncommitted($);
}

async function submitActionWith($: EngineInterface, value: string): Promise<void> {
  await setView($, { actionValue: value });
  await submitAction($);
}

async function submitAction($: EngineInterface): Promise<void> {
  const current = await read($, view);
  if (!current.selectedId || !current.action) {
    return;
  }
  const built = actionArgv(current.action, current.selectedId, current.actionValue);
  if ("error" in built) {
    await setView($, { error: built.error });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: true }));
  const verb = actionVerb(current.action);
  const run = await runLore($, current.root, built.argv);
  if (run.code !== 0) {
    await update($, edits, (e) => ({ ...e, isWriting: false }));
    await setView($, { error: failure(run, verb) });

    return;
  }
  const sync = await runLore($, current.root, ["sync", "--json"]);
  await update($, edits, (e) => ({ ...e, isWriting: false }));
  if (sync.code !== 0) {
    await setView($, { error: `${verb}, but ${failure(sync, "lore sync")}` });

    return;
  }
  const nextId =
    current.action === "rename"
      ? (current.actionValue.trim().split(/\s+/)[0] ?? current.selectedId)
      : current.selectedId;
  await setView($, { action: null, actionValue: "", notice: `${verb}; lore sync ran.`, error: null });
  await openConcept($, nextId);
  await refresh($);
  await countUncommitted($);
}

// ── The dashboard tool (LCLI-668) ─────────────────────────────────────────────

/** One text argument of the call, read as input rather than trusted. */
type TextArg = { ok: true; text: string | null } | { ok: false; why: string };

/**
 * Reads one text argument.
 *
 * Everything that crosses `tool.call` is input to validate, never a fact: the model
 * sends it, and `$.tool.call` lets any plugin send it too (the rule `ui.message`
 * already follows for its posted data). Absent, and blank -- which is the same ask,
 * a model that meant "nothing here" -- leave nothing to do. Present and not text is
 * refused by naming what it was: opening something in its place would be guessing at
 * what was meant.
 */
function textArg(value: unknown): TextArg {
  if (value === undefined || value === null) {
    return { ok: true, text: null };
  }
  if (typeof value !== "string") {
    return { ok: false, why: `must be a string, and this was ${describe(value)}` };
  }

  return { ok: true, text: value.trim() || null };
}

/** `full` as the tool reads it: absent, true, or false; anything else is refused. */
function boolArg(value: unknown): { ok: true; value: boolean | null } | { ok: false; why: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "boolean") {
    return { ok: false, why: `must be true or false, and this was ${describe(value)}` };
  }

  return { ok: true, value };
}

/**
 * What the engine says about our pane right now: its own record, NOT OPEN when the listing
 * carries no pane of ours, or UNKNOWN when this engine cannot be asked at all.
 *
 * The engine's record rather than this module's, and the only reading that separates the
 * three states an open can leave the pane in: drawn, open-but-undrawn, and drawn behind
 * another pane's tab. `$.ui.open`'s own answer gives the first two and cannot give the
 * third, because the tab in front is not the open's business.
 *
 * UNKNOWN is a real answer and not a failure to report, and the catch below carries BOTH
 * ways it happens. The engine's test kit has no `$.ui.panes` at all -- measured there:
 * `$.ui.panes is not a function` -- and a listing that refuses can say nothing either. A
 * caller then falls back to the answer the open itself gave rather than to a state nobody
 * measured. `typeof $.ui.panes !== "function"` is NOT how this is asked: the mod validator
 * refuses `$` read as a value at all ("$.ui.panes is used as a value ... instead of
 * called"), so the call is made and its absence is one of the things the catch catches.
 *
 * The call itself is on every engine this mod supports (checked in the 2.1.287 declaration,
 * the mod's declared floor), so this fallback is what a test drives and what a refused or
 * absent listing leaves -- not the path a real session takes.
 */
type PaneStanding = { known: true; pane: UiPane | null } | { known: false };

async function paneStanding($: EngineInterface): Promise<PaneStanding> {
  try {
    const panes = await $.ui.panes();

    return { known: true, pane: panes.find((listed) => listed.id === PANE) ?? null };
  } catch {
    return { known: false };
  }
}

/** What an argument that should have been text or a boolean is called in the refusal. */
function describe(value: unknown): string {
  if (Array.isArray(value)) {
    return "an array";
  }
  if (typeof value === "object") {
    return "an object";
  }

  return `the ${typeof value} ${String(value)}`;
}

/**
 * The dashboard tool's one line about the size, from the latest draw.
 *
 * DEC-154 rule 4: report the DRAWN size, never the asked one -- "the full size" only
 * when the latest draw came within `SIZE_SLACK` of its ask; "full requested" when no
 * draw of the mode the call asked for has completed (a fresh toggle's restore draw
 * still in flight, say); otherwise the drawn size and why. The dock's short case IS
 * the kept width: a docked full pane more than the slack short of its ask is at a
 * width the surface kept -- the person's `pluginPanes.dockColumns` wins over every
 * request (rule 3) -- so the line says so, classified the way the pane classifies it
 * (the design's own rule: within 4 cells granted, anything further off the person's
 * own; seq 234, both panes alike). The inline short case is the surface keeping room
 * for the prompt above the block.
 *
 * The head is the caller's ("Opened the Lore pane", plus whatever else the call
 * opened), and the clause is joined the way Quest's board joins it (seq 243): the kept
 * width follows the head directly and the two granted shapes are comma-joined, so no
 * shape repeats the word "opened" and the two panes word the same state alike.
 */
function fullSizeAnswer(head: string): string {
  const draw = lastDraw;
  if (draw === null || draw.mode !== "full" || draw.wanted === null) {
    return `${head}, full requested`;
  }
  if (draw.drawn >= draw.wanted - SIZE_SLACK) {
    return `${head}, the full size`;
  }

  return draw.placement === "dock"
    ? `${head} at ${draw.drawn + 1} columns; the width is kept`
    : `${head} at ${draw.drawn} rows; the screen keeps room for the prompt`;
}

/**
 * Opens the pane for the model, and answers with what it opened.
 *
 * Every open is made WITHOUT `focus`, and the mode is set without raising the person's
 * ask: Claude may call this while the person is typing, so the tool never takes the
 * keyboard from the prompt (design of record, opum-doc
 * `docs/reference/pane-dashboard-tool-design.md` at dfde45e). `full` is a state
 * change rather than an open carrying a size, because the draw that follows is the
 * only place that knows the viewport -- exactly how the person's own toggle is
 * answered. What the answer may claim about the size is the latest draw's, never the
 * ask's (DEC-154 rule 4, `fullSizeAnswer`).
 *
 * A `doc` the bundle does not have opens nothing else in its place: it is read FIRST, and
 * the refusal returns before any other argument is applied -- no pane open, no tab switch,
 * no search. The failed read is not without trace: it leaves the pane's own status line
 * carrying lore's message, which is what the person sees if the pane is already up. That
 * line is a report of the failure, not something opened in the document's place.
 */
async function openDashboard(
  $: EngineInterface,
  args: Readonly<Record<string, unknown>>,
): Promise<{ result: string } | { deny: string }> {
  const doc = textArg(args.doc);
  if (!doc.ok) {
    return { deny: `The dashboard tool's "doc" ${doc.why}.` };
  }
  const query = textArg(args.query);
  if (!query.ok) {
    return { deny: `The dashboard tool's "query" ${query.why}.` };
  }
  const full = boolArg(args.full);
  if (!full.ok) {
    return { deny: `The dashboard tool's "full" ${full.why}.` };
  }

  const opened: string[] = [];
  // The one line the answer below is built from. The `full` arm sets it, joining the
  // size clause to the head the way Quest's board joins it (seq 243): the kept width
  // follows the head directly -- "Opened the Lore pane at 80 columns; the width is
  // kept." -- rather than comma-joined like the other parts, so no shape repeats the
  // word "opened". The clause is read as the mode is set, before the open below, so the
  // answer reports the draw the call found rather than one it caused.
  let line: string | null = null;
  if (doc.text !== null) {
    const outcome = await openConcept($, doc.text);
    if (!outcome.ok) {
      return { deny: `No document "${doc.text}" in this bundle: ${outcome.error}` };
    }
    opened.push(`${doc.text} on Read`);
  }
  if (query.text !== null) {
    await setView($, { query: query.text });
    if (doc.text === null) {
      await showTab($, "search");
      opened.push(`Search for "${query.text}"`);
    } else {
      // The Read tab holds the pane, so the search is loaded rather than shown; the
      // line says which of the two the person sees.
      opened.push(`"${query.text}" waiting in Search`);
    }
  }
  if (full.value !== null) {
    await setPaneMode($, full.value ? "full" : "normal");
    const head = `Opened the Lore pane${opened.length > 0 ? `, ${opened.join(", ")}` : ""}`;
    line = full.value ? fullSizeAnswer(head) : `${head}, its normal size`;
  }
  // The pane is refreshed on every call, as it was on every invocation of the slash command
  // this tool replaced: only the `query` arm refreshes on its own -- through `showTab` -- so
  // without this a bare call or a `full`-only one would leave the catalogue as stale as the
  // 30-second timer allows. Fired after the state above is applied, so it reads what the call
  // leaves behind, and skipped in the one case that has already refreshed that same state
  // (the query arm with no `doc`, where the tab switch is the refresh), so no call runs
  // `lore query` twice for one ask.
  const refreshedByTab = doc.text === null && query.text !== null;
  if (!refreshedByTab) {
    void refresh($);
  }
  // This open is unsized, and "each open sets it anew": a size asked for earlier is cleared
  // by it, not left standing. `openPane` raises the one restoration ask for that (DEC-154
  // rule 2 as amended: an ask is raised by a toggle, or by an open that cleared the size,
  // and never by a resize or a redraw), so the next draw re-asks the size the mode implies.
  // Without the restoration, a call that did NOT change the mode (an already-full pane,
  // which is the steady state of a remembered full mode, or a `full: true` call on one)
  // would leave the surface at its share and nothing to re-ask (LCLI-668 review F2).
  const asked = await openPane($);
  // What actually happened, from the engine rather than from the ask: the listing says
  // whether the pane is drawn and whether it is the tab on top, and the open's own answer
  // stands where the engine cannot be asked or lists nothing of ours.
  const standing = await paneStanding($);
  const listed = standing.known ? standing.pane : null;
  const isPlaced = listed?.isPlaced ?? asked.isPlaced;
  const isShown = listed?.isShown ?? isPlaced;
  const detail = opened.length > 0 ? `, ${opened.join(", ")}` : "";
  const answer = line ?? `Opened the Lore pane${detail}`;

  if (!isPlaced) {
    // The open is UNASKED -- nobody's command, prompt or press is behind a tool call --
    // so below the engine's floor it WAITS UNDRAWN, and the answer has to say that rather
    // than report the ask (opum-doc seq 182 item 3). Measured on Claude Code 2.1.288
    // (LCLI-672): a model's tool call at 100 columns answered `{ isPlaced: false }` and
    // drew nothing, where the same pane opened from a band Button press drew at once.
    //
    // The reason is the ENGINE'S own, because the floor is not a constant: it is 144
    // columns for a pane nobody has opened, 110 for one the person has opened before (in
    // this session or an earlier one), and a surface that places no panes has no floor at
    // all. A number written here would be wrong in exactly the case the person is asking
    // about, so the engine's sentence -- which names the floor that applies and the width
    // now -- is carried instead of one composed here.
    const reason = asked.isPlaced === false ? asked.reason : "it waits undrawn at this surface's size";

    return { result: `The Lore pane is open but not drawn${detail}: ${reason}` };
  }
  if (!isShown) {
    // Drawn, and behind another pane's tab: open, and not the one in front. "Opened" alone
    // would be as wrong as "not drawn", so the answer says which it is.
    return { result: `${answer}, behind the pane in front.` };
  }

  return { result: `${answer}.` };
}

// ── The module ────────────────────────────────────────────────────────────────

export const register: Register = (on, _options) => {
  on("session.start", async ($, e, next) => {
    await setView($, { root: await resolveRoot($) });
    // The pane's ONLY entry point (LCLI-667/668, opum-doc design of record): the tool the
    // `lore` skill routes `dashboard` to. No slash command is registered -- the engine's
    // `lore` skill owns that name, so a command of the same name is refused and takes this
    // whole hook down with it (measured on Claude Code 2.1.288). Awaited, because the first
    // `session.start` is awaited before the first prompt and a registration not awaited
    // there is not listed by turn one; its description stays short for the same reason it
    // exists at all -- it is listed to the model in every session that loads this mod.
    await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: TOOL_INPUT_SCHEMA });
    // The remembered size is restored here and ASKED for by the first draw: the
    // session's own surface has not been measured yet (`SessionStartInput` carries
    // no viewport), and a draw is the first moment `e.viewport` exists. The open
    // below raises the one restoration ask a full mode owes (DEC-154 rule 2 as
    // amended: a stored full mode asks once, on its first render).
    const remembered: PaneMode = (await $.store.get(MODE_KEY)) === "full" ? "full" : "normal";
    await update($, pane, (state) => ({ ...state, mode: remembered }));
    // Raised synchronously, so the first draw cannot beat the ask to the state: the
    // open below raises the same one again for its own callers. The drawings of a
    // previous session in this process are dropped with it -- the tool's answer and
    // the held-width reading both describe the pane THIS session draws.
    pendingAsk = remembered === "full" ? { mode: "full", byPerson: false } : null;
    lastDraw = null;
    void refresh($);
    void countUncommitted($);
    // The session's own open, which nobody asked for by hand: on a terminal under the
    // engine's floor it is refused, and the refused answer is what the band then offers.
    void openPane($);
    $.clock.every(REFRESH_MS, () => {
      void (async () => {
        const panes = await $.ui.panes();
        if (panes.some((pane) => pane.id === PANE && pane.isShown)) {
          await refresh($);
          await countUncommitted($);
        }
      })();
    });

    return next(e);
  });

  // The tool the mod registers at session start, served here. Its arguments arrive
  // as the model sent them, so `openDashboard` reads them as input to validate; the
  // answer is one short line naming what it opened, or a `deny` -- which the model
  // reads as an error result -- naming the argument that was wrong.
  on("tool.call", { tool: TOOL }, async ($, e) => await openDashboard($, e));

  // The inline editor posts its text here; `e.data` is code's, not the engine's, so
  // every field is checked rather than trusted (ClientSurface.post's own note: input
  // to validate, not a fact).
  on("ui.message", async ($, e, next) => {
    const data = e.data;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const posted = data as { kind?: unknown; text?: unknown };
      if (posted.kind === "text" && typeof posted.text === "string") {
        // The posted text becomes the editor's props on the next draw, and the engine
        // refuses the WHOLE PANE's render once a `Client`'s props pass its bound. That
        // refusal is unescapable in place — the pane's own buttons stop drawing with it —
        // so the growth is refused here instead: the editor closes, nothing is written,
        // and the person is sent to the arm that has no such bound. Opening is guarded
        // too (`beginBodyEdit`); this is the other way a body gets too big, by growing.
        if (!editorFits(posted.text)) {
          await update($, edits, (state) => ({ ...state, bodyEditing: false, bodyDocId: null, bodyText: "" }));
          await setView($, {
            error: `The body grew past what the editor can hand back (${posted.text.length} characters), so the editor was closed and nothing was written. Use Open in editor, which has no such limit.`,
            notice: null,
          });

          return next(e);
        }
        await update($, edits, (state) => ({ ...state, bodyText: posted.text as string }));
      }
    }

    return next(e);
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    if (e.surface === "mobile") {
      const { Box, Text } = $.ui.resolve(e);

      return (
        <Box flexDirection="column">
          <Text>The Lore pane needs the terminal or desktop: open it there to browse and edit.</Text>
        </Box>
      );
    }

    // The pane's size: a draw is the only place `e.viewport` exists, so a full-size
    // request is made here rather than at the key or the command that asked for it.
    const { mode } = await read($, pane);
    // A surface that has not measured reports no viewport at all, and 0 stands in
    // for it here: nothing can be asked for from a surface with no size.
    const wanted =
      mode === "full"
        ? wantedSize(e.props.placement, e.viewport?.columns ?? 0, e.viewport?.rows ?? 0, e.props.bodyColumns)
        : null;
    // The size actually drawn, against the size asked for. Both are this render's, so the
    // dock's terminal-width recovery never mixes two draws' numbers (DEC-154 rule 2 as
    // amended), and the comparison is only ever read in full mode: the normal size is
    // whatever the surface's own share is, so there is nothing there for the pane to
    // have been denied.
    const drawn = e.props.placement === "dock" ? e.props.bodyColumns : e.props.scroll.bodyRows;
    const shortOfFull = wanted !== null && drawn < wanted - SIZE_SLACK;
    // Spend the ask a toggle (or an open that cleared the size) raised.
    if (pendingAsk !== null && pendingAsk.mode === mode) {
      // The ask a toggle (or an open that cleared the size) raised, spent by the first
      // draw that can build it -- and only by one applying the mode it was raised for,
      // so a stale draw still in flight does not spend it (LCLI-668 review F5). A full
      // ask with no size to ask from stays standing for the draw that has one, and it is
      // cleared before the call, so a draw that runs while the open is in flight does not
      // ask a second time. DEC-154 rule 2 as amended: nothing here re-derives the ask
      // from a resize or a redraw, which is what would chase the pane's own width.
      if (mode === "normal" || wanted !== null) {
        const askedByThePerson = pendingAsk.byPerson;
        pendingAsk = null;
        void requestPane($, e.props.placement, wanted, askedByThePerson);
      }
    }
    // The latest render, for the dashboard tool's answer (DEC-154 rule 4).
    lastDraw = { mode, placement: e.props.placement, wanted, drawn };

    const elements = $.ui.resolve(e);
    const { Box, Button, Code, Input, Markdown, Select, Text } = elements;
    // Only the terminal and desktop surfaces carry `Client` — the vscode surface does
    // not — so the editor is offered where a region exists, and the surface that has
    // none says so instead of drawing nothing.
    const Client = "Client" in elements ? elements.Client : null;
    const current = await read($, view);
    const { concepts, types, hits } = await read($, catalog);
    const { concept } = await read($, doc);
    const { isWriting, draft, fields, uncommitted, bodyEditing, bodyDocId, bodyText, bodyRevision } = await read($, edits);
    // The editor is open only while it is open on THIS document — the same binding
    // `saveBody` enforces on the write.
    const editsOpen = bodyEditing && concept !== null && bodyDocId === concept.id;
    // The editor's region, in rows. A `Client` with no `height` is "as tall as what the
    // module draws", and the module draws `surface.rows - 1` document rows — a region
    // sized by its own content, whose only fixed point is a single document line. An
    // explicit height breaks that feedback loop: what is drawn no longer decides how
    // much room there is to draw it in. Sized off the pane, less the Read tab's chrome.
    const editorRows = Math.max(6, Math.min(24, e.props.scroll.bodyRows - 12));

    // The one line a full docked pane shows while it drew short of its ask -- a width
    // the surface kept rather than granted, which for a dock is the person's own
    // (`pluginPanes.dockColumns` wins over every request, DEC-154 rule 3). It names
    // that width and how to change it, in place of a generic held hint, on EVERY draw
    // that reads short -- including the render that spends the ask, because a kept
    // width is what the surface will keep answering with, and an ignored request
    // raises no further draw to say it on (measured, LCLI-676: the spending render is
    // the LAST one, so a suppression there is permanent). The classification is the
    // design's own -- within `SIZE_SLACK` granted, anything further off the person's
    // -- which is how Quest's board reads the same state (seq 234). Inline shortfalls
    // are the content-sized pane being honest, and show nothing (rule 1).
    const fullHint =
      shortOfFull && e.props.placement === "dock" ? (
        <Text dimColor wrap="truncate">
          {keptWidthLine(drawn + 1)}
        </Text>
      ) : null;

    // The split layout, and how wide its list column is. The column takes about a
    // third of the body, kept inside a width a title reads at: under ~24 columns a
    // title is all ellipsis, and past ~48 the list costs the document more than a
    // list of titles earns back.
    const sideBySide = mode === "full" && e.props.bodyColumns >= SIDE_BY_SIDE_COLUMNS;
    const listColumns = Math.max(24, Math.min(48, Math.floor(e.props.bodyColumns / 3)));

    /**
     * The bundle list: one heading per type, one row per concept, capped to the room
     * it is given. Browse draws it as its whole body; the Read tab draws it in the
     * left column, where `highlight` is the open document -- the one row at full
     * strength, since a plain Button draws the same under `variant` and the row's own
     * emphasis is what is left to mark it with.
     */
    const bundleRows = (room: number, highlight: string | null) => {
      const flat: BrowseRow[] = [];
      for (const group of groupByType(concepts)) {
        if (flat.length >= room || flat.length >= ROW_CAP) {
          break;
        }
        flat.push({
          kind: "group",
          key: `group-${group.type}`,
          type: group.type,
          count: group.rows.length,
        });
        for (const row of group.rows) {
          if (flat.length >= room || flat.length >= ROW_CAP) {
            break;
          }
          flat.push({ kind: "row", key: `open-${row.id}`, id: row.id, title: row.title });
        }
      }

      return flat.map((entry) =>
        entry.kind === "group" ? (
          <Text key={entry.key} bold>
            {entry.type} ({entry.count})
          </Text>
        ) : (
          <Button
            key={entry.key}
            label={entry.title}
            plain
            dimColor={entry.id !== highlight}
            onPress={() => void openConcept($, entry.id)}
          />
        ),
      );
    };

    /**
     * The open document, as the Read tab draws it and as a side-by-side Search draws
     * it in the right column. Before anything is open it is the pane's own prompt.
     *
     * A function rather than a value: both layouts draw the same tree, and the tab
     * that shows it is the only one that builds it.
     */
    const documentColumn = () => {
      if (!concept) {
        return <Text dimColor>Pick a document from Browse or Search.</Text>;
      }
    const required = requiredSectionsFor(types, concept.type);
    const missing = required.filter((name) => !hasSection(concept.body, name));

    const fieldsForm = fields ? (
      <Box flexDirection="column">
        <Input
          key="f-title"
          label="title:"
          value={fields.title}
          submitLabel="Set"
          onInput={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, title: value } } : state,
            )
          }
          onSubmit={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, title: value } } : state,
            )
          }
        />
        <Input
          key="f-summary"
          label="summary:"
          value={fields.summary}
          submitLabel="Set"
          onInput={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, summary: value } } : state,
            )
          }
          onSubmit={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, summary: value } } : state,
            )
          }
        />
        <Input
          key="f-tags"
          label="tags:"
          value={fields.tags}
          submitLabel="Set"
          onInput={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, tags: value } } : state,
            )
          }
          onSubmit={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, tags: value } } : state,
            )
          }
        />
        <Input
          key="f-status"
          label="status:"
          value={fields.status}
          submitLabel="Set"
          onInput={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, status: value } } : state,
            )
          }
          onSubmit={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, status: value } } : state,
            )
          }
        />
        <Box>
          <Button
            key="f-save"
            label={isWriting ? "Saving…" : "Save"}
            variant="primary"
            onPress={() => void saveFields($)}
          />
          <Text> </Text>
          <Button
            key="f-cancel"
            label="Cancel"
            onPress={() => void update($, edits, (state) => ({ ...state, fields: null }))}
          />
        </Box>
      </Box>
    ) : null;

    const actionForm = current.action ? (
      <Box>
        <Input
          key="action-value"
          label={`${current.action}:`}
          placeholder={
            current.action === "rename"
              ? "new/id"
              : current.action === "supersede"
                ? "replacement/id"
                : "LCLI-123 LCLI-124"
          }
          value={current.actionValue}
          submitLabel="Run"
          autoFocus
          onInput={(value: string) => void setView($, { actionValue: value })}
          onSubmit={(value: string) => void submitActionWith($, value)}
        />
        <Text> </Text>
        <Button key="action-cancel" label="Cancel" onPress={() => void setView($, { action: null, actionValue: "" })} />
      </Box>
    ) : null;

      return (
        <Box flexDirection="column">
        <Box>
          <Text bold wrap="truncate">
            {concept.title}
          </Text>
        </Box>
        <Text dimColor wrap="truncate">
          {concept.id} · {concept.type}
          {concept.status ? ` · ${concept.status}` : ""}
          {concept.tags.length > 0 ? ` · ${concept.tags.join(", ")}` : ""}
          {concept.tasks.length > 0
            ? ` · ${concept.tasks.length} linked ${concept.tasks.length === 1 ? "task" : "tasks"}`
            : ""}
        </Text>
        {concept.tasks.length > 0 ? (
          <Text dimColor wrap="truncate">
            {concept.tasks.map((task) => `${task.id} ${task.status}`).join("  ")}
          </Text>
        ) : null}
        <Box>
          <Button
            key="view-rendered"
            label="Rendered"
            variant={current.isRaw ? undefined : "primary"}
            onPress={() => void setView($, { isRaw: false })}
          />
          <Text> </Text>
          <Button
            key="view-raw"
            label="Raw"
            variant={current.isRaw ? "primary" : undefined}
            onPress={() => void setView($, { isRaw: true })}
          />
          <Text> </Text>
          <Button key="back" label="Back" hotkey="b" onPress={() => void goBack($)} />
          <Text> </Text>
          <Button key="edit-fields" label="Edit fields" hotkey="e" onPress={() => void openFields($)} />
          <Text> </Text>
          <Button
            key="edit-body"
            label="Edit body"
            variant={editsOpen ? "primary" : undefined}
            onPress={() => void (editsOpen ? cancelBodyEdit($) : beginBodyEdit($))}
          />
          <Text> </Text>
          <Button key="open-editor" label="Open in editor" onPress={() => void openInEditor($)} />
          <Text> </Text>
          <Button
            key="ask"
            label="Ask Claude…"
            onPress={() =>
              void $.prompt.fill({
                text: `Revise the document ${concept.id} in this repository: `,
                mode: "replace",
              })
            }
          />
        </Box>
        <Box>
          <Button
            key="act-rename"
            label="Rename…"
            onPress={() => void setView($, { action: "rename", actionValue: "" })}
          />
          <Text> </Text>
          <Button
            key="act-supersede"
            label="Supersede…"
            onPress={() => void setView($, { action: "supersede", actionValue: "" })}
          />
          <Text> </Text>
          <Button
            key="act-link"
            label="Link task…"
            onPress={() => void setView($, { action: "link", actionValue: "" })}
          />
          <Text> </Text>
          <Button
            key="act-unlink"
            label="Unlink task…"
            onPress={() => void setView($, { action: "unlink", actionValue: "" })}
          />
        </Box>
        {actionForm}
        {fieldsForm}
        {required.length > 0 ? (
          <Text dimColor wrap="truncate">
            Required sections:{" "}
            {required.map((name) => `${hasSection(concept.body, name) ? "✓" : "•"} ${name}`).join("  ")}
            {missing.length === 0 ? " (all present)" : ""}
          </Text>
        ) : null}
        {editsOpen ? (
          <Box flexDirection="column">
            {Client ? (
              <Client
                key="body-editor"
                module="./editor.tsx"
                props={{ text: bodyText, revision: bodyRevision }}
                height={editorRows}
              />
            ) : (
              <Text dimColor>This surface has no editor region; use Open in editor instead.</Text>
            )}
            <Box>
              <Button
                key="body-save"
                label={isWriting ? "Saving…" : "Save body"}
                variant="primary"
                onPress={() => void saveBody($)}
              />
              <Text> </Text>
              <Button key="body-cancel" label="Cancel" onPress={() => void cancelBodyEdit($)} />
              <Text dimColor> Save writes the file, then `lore validate`; a rejection keeps the file.</Text>
            </Box>
          </Box>
        ) : null}
        <Box marginTop={1}>
          {editsOpen ? null : current.isRaw ? (
            <Code source={cap(concept.raw ?? concept.body)} path={concept.path} startLine={1} />
          ) : (
            <Markdown
              key="body"
              text={cap(concept.body)}
              pressableLinks={internalHrefs(concept.body)}
              onLinkPress={(link) => {
                const id = bundleIdFor(link.href, concept.id);
                if (id) {
                  void openConcept($, id);
                }
              }}
            />
          )}
        </Box>
        {!editsOpen && isCapped(concept.raw ?? concept.body) && !current.isRaw ? (
          <Text dimColor wrap="truncate">
            Truncated at {BODY_CAP} characters; switch to Raw or open the file for the rest.
          </Text>
        ) : null}
        {!editsOpen && isCapped(concept.raw ?? concept.body) && current.isRaw ? (
          <Text dimColor wrap="truncate">
            Truncated at {BODY_CAP} characters; open {concept.repoPath} for the rest.
          </Text>
        ) : null}
        </Box>
      );
    };

    const tabs = (
      <Box>
        <Button
          key="tab-browse"
          label="Browse"
          hotkey="1"
          variant={current.tab === "browse" ? "primary" : undefined}
          onPress={() => void showTab($, "browse")}
        />
        <Text> </Text>
        <Button
          key="tab-read"
          label="Read"
          hotkey="2"
          variant={current.tab === "read" ? "primary" : undefined}
          onPress={() => void showTab($, "read")}
        />
        <Text> </Text>
        <Button
          key="tab-search"
          label="Search"
          hotkey="3"
          variant={current.tab === "search" ? "primary" : undefined}
          onPress={() => void showTab($, "search")}
        />
        <Text> </Text>
        <Button
          key="tab-new"
          label="New"
          hotkey="4"
          variant={current.tab === "new" ? "primary" : undefined}
          onPress={() => void showTab($, "new")}
        />
        <Text> </Text>
        <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refresh($)} />
        <Text> </Text>
        <Button
          key="across"
          label={current.acrossRefs ? "Refs: on" : "Refs: off"}
          hotkey="a"
          onPress={() => void toggleAcross($)}
        />
        <Text> </Text>
        {/* The current mode as state, with the key that changes it as the hint: the
            label used to name the ACTION ("Normal size", "Full screen"), which read as
            the state it was not -- ruled by opum-doc (its Article 5 call, seq 243) for
            both panes as "Normal · z for full" / "Full · z for normal". While a width
            is kept, the pane's own line under this header says so (DEC-154 rule 3). */}
        <Button
          key="full"
          label={mode === "full" ? "Full · z for normal" : "Normal · z for full"}
          hotkey="z"
          onPress={() => void togglePane($)}
        />
      </Box>
    );

    const statusLine = current.error ? (
      <Text color="red" wrap="truncate">
        {current.error}
      </Text>
    ) : current.notice ? (
      <Text dimColor wrap="truncate">
        {current.notice}
      </Text>
    ) : current.isLoading ? (
      <Text dimColor>Reading the bundle…</Text>
    ) : null;

    const strip =
      uncommitted.length > 0 && current.root ? (
        <Box>
          <Text color="yellow" wrap="truncate">
            {uncommitted.length} documentation {uncommitted.length === 1 ? "change" : "changes"} not committed yet.{" "}
          </Text>
          <Button
            key="land"
            label="Ask Claude to land them"
            onPress={() =>
              void $.prompt.fill({
                text: "Land the uncommitted documentation changes in this repository through a branch and pull request, following the opum-sdlc skill. Run `lore check` as the definition of done.",
                mode: "replace",
              })
            }
          />
        </Box>
      ) : null;

    if (current.tab === "browse") {
      return (
        <Box flexDirection="column">
          {tabs}
          {statusLine}
          {fullHint}
          {strip}
          <Text dimColor wrap="truncate">
            {concepts.length} {concepts.length === 1 ? "concept" : "concepts"}
            {current.typeFilter ? ` of type ${current.typeFilter}` : ""}
            {current.tagFilter ? ` tagged ${current.tagFilter}` : ""}
            {current.acrossRefs ? ", across refs" : ""}.
          </Text>
          {bundleRows(Math.max(6, e.props.scroll.bodyRows - 10), null)}
        </Box>
      );
    }

    if (current.tab === "search") {
      const room = Math.max(5, e.props.scroll.bodyRows - 12);
      const typeOptions = [
        { value: "", label: "all types" },
        ...types.map((one) => ({ value: one.name, label: one.name })),
      ];
      // The results, as the stacked tab draws them below the form and as the left
      // column of the split draws them beside the document. `highlight` marks the
      // open document's own hit where the document is on screen next to it; the
      // stacked tab passes none, exactly as it drew before there was a split.
      const results = (highlight: string | null) =>
        hits.slice(0, room).map((hit) => (
          <Box key={`hit-${hit.id}`} flexDirection="column">
            <Button
              key={`open-${hit.id}`}
              label={hit.title}
              plain
              dimColor={hit.id !== highlight}
              onPress={() => void openConcept($, hit.id)}
            />
            <Text dimColor wrap="truncate">
              {hit.type} · {hit.id}
            </Text>
            {hit.snippet ? <Text wrap="truncate">{hit.snippet}</Text> : null}
          </Box>
        ));
      const form = (
        <>
          <Input
            key="search-text"
            placeholder="Search the bundle"
            value={current.query}
            submitLabel="Search"
            onInput={(value: string) => void setView($, { query: value })}
            onSubmit={(value: string) => void submitWith($, { query: value })}
          />
          <Box>
            <Select
              key="search-type"
              label="type:"
              options={typeOptions}
              value={current.typeFilter}
              onSelect={(value: string) => void pickFilter($, "typeFilter", value)}
            />
            <Text> </Text>
            <Input
              key="search-tag"
              label="tag:"
              placeholder="any"
              value={current.tagFilter}
              submitLabel="Filter"
              onInput={(value: string) => void setView($, { tagFilter: value })}
              onSubmit={(value: string) => void submitWith($, { tagFilter: value })}
            />
          </Box>
          <Text dimColor wrap="truncate">
            {hits.length} {hits.length === 1 ? "result" : "results"}
            {current.acrossRefs ? ", across refs" : ""}.
          </Text>
        </>
      );

      return (
        <Box flexDirection="column">
          {tabs}
          {statusLine}
          {fullHint}
          {form}
          {sideBySide ? (
            // The search form stays pane-wide -- it is how the list is made -- and the
            // list it makes takes the left column, the open document the right one.
            <Box flexDirection="row" key="side-by-side">
              <Box flexDirection="column" width={listColumns} paddingRight={1}>
                {results(current.selectedId)}
              </Box>
              <Box flexDirection="column" flexGrow={1}>
                {documentColumn()}
              </Box>
            </Box>
          ) : (
            results(null)
          )}
        </Box>
      );
    }

    if (current.tab === "new") {
      const typeOptions = types.map((one) => ({ value: one.name, label: one.name }));
      const required = types.find((one) => one.name === draft.type)?.requiredSections ?? [];

      return (
        <Box flexDirection="column">
          {tabs}
          {statusLine}
          {fullHint}
          {typeOptions.length === 0 ? (
            <Text dimColor>No type vocabulary read yet — press Refresh.</Text>
          ) : (
            <Select
              key="new-type"
              label="type:"
              options={typeOptions}
              value={draft.type || (typeOptions[0]?.value ?? "")}
              onSelect={(value: string) =>
                void update($, edits, (state) => ({
                  ...state,
                  draft: { ...state.draft, type: value },
                }))
              }
            />
          )}
          <Input
            key="new-title"
            label="title:"
            placeholder="A title for the new document"
            value={draft.title}
            submitLabel="Set"
            onInput={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, title: value },
              }))
            }
            onSubmit={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, title: value },
              }))
            }
          />
          <Input
            key="new-summary"
            label="summary:"
            placeholder="One sentence"
            value={draft.summary}
            submitLabel="Set"
            onInput={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, summary: value },
              }))
            }
            onSubmit={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, summary: value },
              }))
            }
          />
          <Input
            key="new-tags"
            label="tags:"
            placeholder="comma-separated"
            value={draft.tags}
            submitLabel="Set"
            onInput={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, tags: value },
              }))
            }
            onSubmit={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, tags: value },
              }))
            }
          />
          {required.length > 0 ? (
            <Text dimColor wrap="truncate">
              Afterwards the type wants: {required.join(", ")}.
            </Text>
          ) : null}
          <Box>
            <Button
              key="create"
              label={isWriting ? "Creating…" : "Create"}
              variant="primary"
              onPress={() => void createNew($)}
            />
          </Box>
          <Text dimColor wrap="truncate">
            Runs `lore new` in this repository; the result opens in Read.
          </Text>
        </Box>
      );
    }

    // Read tab, and the fallthrough: every other tab has answered above. The document
    // is `documentColumn`, which the split draws in the right column beside the list
    // and the stacked layout draws under the pane's own chrome. With no document open
    // there is nothing to land: the landing strip is the document view's own chrome, and
    // this tab drew it only once a document was open until the LCLI-666 move folded the
    // two trees together. Restored here (LCLI-668 review F4) -- whether the strip belongs
    // on an empty Read tab is a separate question, for whoever owns that tab.
    return (
      <Box flexDirection="column">
        {tabs}
        {statusLine}
        {fullHint}
        {concept ? strip : null}
        {sideBySide ? (
          <Box flexDirection="row" key="side-by-side">
            <Box flexDirection="column" width={listColumns} paddingRight={1}>
              {bundleRows(Math.max(6, e.props.scroll.bodyRows - 6), concept ? concept.id : null)}
            </Box>
            <Box flexDirection="column" flexGrow={1}>
              {documentColumn()}
            </Box>
          </Box>
        ) : (
          documentColumn()
        )}
      </Box>
    );
  });

  // The band above the prompt, drawn while the pane is open and NOT drawn. It is the whole
  // reason the honest answer above matters: a model can open the pane on a terminal too
  // narrow to show an unasked pane, and the person then needs one press to seat it. Read
  // from the engine on every draw rather than remembered, so widening the terminal -- which
  // seats the pane and redraws -- takes the band away on its own, with nothing to expire.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    // A survey holds the band; every hook on it yields, and so does this one.
    if (e.props.hasSurvey) {
      return next(e);
    }
    // The engine's listing first -- it is the only reading that notices the pane being
    // placed without an open (a terminal widened past the floor) and so the only one that
    // takes this line away by itself. Where it cannot be read, the module's own record of
    // its last open stands in.
    const standing = await paneStanding($);
    const { isWaiting } = await read($, pane);
    const waits = standing.known ? standing.pane !== null && !standing.pane.isPlaced : isWaiting;
    if (!waits) {
      return next(e);
    }
    // The press makes the open ITSELF, in the press, because "asked" is the press the
    // engine is running: an open deferred out of it -- to a timer, or to a later draw --
    // is unasked again and waits at the same width (measured, LCLI-672).
    const open = async () => {
      await openPane($);
    };
    const { Box, Button, Text } = $.ui.resolve(e);

    // Rendered: `Lore pane ready · [Open] (ctrl+x tab, o)` -- the same shape quest-cli's
    // board band carries, so the two bands read alike.
    return (
      <Box>
        <Text dimColor>{BAND_TEXT} · </Text>
        <Button key="open" label="Open" hotkey="o" onPress={open} />
        <Text dimColor> {BAND_HINT}</Text>
      </Box>
    );
  });
};
