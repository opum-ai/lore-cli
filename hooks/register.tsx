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
import type { EngineInterface, Register } from "claude-code";

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

const PANE = "lore-pane";
const COMMAND = "lore-pane";
const REFRESH_MS = 30_000;
const TIMEOUT_MS = 30_000;
const ROW_CAP = 120;

// ── The full-screen toggle (LCLI-666) ─────────────────────────────────────────

/** Where the surface seated the pane, as the `Pane` render props carry it. */
type Placement = "dock" | "inline";

/** The `$.store` key holding the remembered full-or-normal choice (a `PaneMode`). */
const MODE_KEY = "pane-mode";

/**
 * The transcript columns a docked full pane leaves visible.
 *
 * A request is the largest the surface allows only up to the layout's own
 * arithmetic, and a docked pane that asks for every column takes the
 * conversation with it: the design keeps a margin (~20 columns) so the
 * transcript stays readable beside the pane.
 */
const DOCK_MARGIN_COLUMNS = 20;

/**
 * The rows the prompt area takes on the main screen, subtracted from the viewport
 * height when an inline pane asks for its full size.
 *
 * The design's figure, not this module's estimate: `rows` is "the viewport height
 * minus 6 rows for the prompt area" (opum-doc,
 * `pane-full-screen-and-quest-migration-skill-design.md` at 080b63a, where quest-cli's
 * measurement settled what the design had left open). It stays a constant because the
 * engine exposes no such reading -- `e.viewport.rows` is "cells down the whole
 * surface" and `RenderViewport` carries nothing for the composer, while the inline
 * pane's own `scroll.bodyRows` measures the pane rather than the prompt. The request
 * it feeds is a request, not a grant: the surface clamps to what the layout spares,
 * so a short terminal costs the pane rows rather than overflowing.
 */
const PROMPT_AREA_ROWS = 6;

/**
 * The cells between the size a request asks for and the size the body measures.
 *
 * `columns` and `rows` are the pane's own size; `bodyColumns` is "cells across
 * the body, inside the frame". One slack covers the frame and the chrome a
 * surface draws around the body, so a pane that got what it asked for is not
 * read as short of it.
 */
const SIZE_SLACK = 4;

/** The one-line hint a pane shows when the size it drew is not the size it asked for. */
const FULL_HINT = "Drag the pane edge to resize; z switches layouts";

/**
 * The body columns from which the pane draws its list in a left column and the
 * document in the right one, instead of stacked (design: "at least 120 body
 * columns", the same threshold the Quest board splits at). Below it -- and outside
 * full mode, where the pane is whatever size the surface's share gave it -- both
 * tabs keep the stacked layout.
 */
const SIDE_BY_SIDE_COLUMNS = 120;

/** One line of the bundle list: a type's heading, or a concept that opens. */
type BrowseRow =
  | { kind: "group"; key: string; type: string; count: number }
  | { kind: "row"; key: string; id: string; title: string };

/**
 * The normal size, as the request that asks for it: an open with no `columns`
 * and no `rows`. Both are requests a surface re-reads on every open ("Each open
 * sets it anew"), so returning to the normal size is asking for the surface's
 * own share again rather than leaving the last full-size request standing.
 */
const NORMAL_REQUEST = "normal";

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

const pane = atom({ plugin: "opum-lore", key: "pane" } as const, { mode: "normal" } satisfies PaneState);

/**
 * The size request this pane last made, as `requestKey` names it.
 *
 * The render hook is the only place that knows `e.viewport`, so it is the only
 * place that can size a request -- but a draw is not an event: the asked-for
 * size must not be re-asked on every draw (the person's own drag wins, so the
 * drawn size would never come to match it and the pane would ask forever). This
 * is the guard that makes each distinct request once-only. `NORMAL_REQUEST`
 * matches the unsized open `session.start` makes, so a session that opens
 * normally asks nothing until someone toggles.
 */
let lastRequest = NORMAL_REQUEST;

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
 * The size a full-screen request asks for, or null when there is nothing to ask
 * from: docked panes ask in `columns`, inline ones in `rows` (`PaneOpenArgs`),
 * and a surface that was never measured -- or one too small to hold the margin
 * and the pane both -- has no size to request.
 */
function wantedSize(placement: Placement, columns: number, rows: number): number | null {
  const size = placement === "dock" ? columns - DOCK_MARGIN_COLUMNS : rows - PROMPT_AREA_ROWS;

  return size > 0 ? size : null;
}

/** How a request is named for the once-only guard: the normal share, or a sized request. */
function requestKey(placement: Placement, wanted: number | null): string {
  return wanted === null ? NORMAL_REQUEST : `${placement}:${wanted}`;
}

/**
 * Asks the surface for the pane, sized when there is a size to ask for.
 *
 * `focus` rides every reopen (a request, not a grant: the surface hands the
 * pane the keyboard only over an empty composer) and `closeOnEscape` is never
 * passed -- that pair is what would make the pane a dialog rather than a pane.
 */
async function requestPane($: EngineInterface, placement: Placement, wanted: number | null): Promise<void> {
  if (wanted === null) {
    await $.ui.open({ id: PANE, title: "Lore", focus: true });

    return;
  }
  await $.ui.open(
    placement === "dock"
      ? { id: PANE, title: "Lore", focus: true, columns: wanted }
      : { id: PANE, title: "Lore", focus: true, rows: wanted },
  );
}

/**
 * Flips the pane between its normal size and the largest the surface allows.
 *
 * The size itself is asked for by the next draw, which is the only place that
 * knows `e.viewport`; this leaves the choice where a draw will find it. The
 * store write is best-effort: a store that refuses loses the memory of the
 * choice, which is not a reason to refuse the toggle.
 */
async function togglePane($: EngineInterface): Promise<PaneMode> {
  const next: PaneMode = (await read($, pane)).mode === "full" ? "normal" : "full";
  await update($, pane, (state) => ({ ...state, mode: next }));
  try {
    await $.store.set(MODE_KEY, next);
  } catch {
    // The pane toggles either way; only the next session's memory of it is lost.
  }

  return next;
}

/** What the pane says it did, in the words both the command and a toggle answer with. */
function modeText(mode: PaneMode): string {
  return mode === "full" ? "Lore pane is full screen." : "Lore pane is at its normal size.";
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

async function loadConcept($: EngineInterface, id: string, patch: Partial<View> = {}): Promise<void> {
  const root = await ensureRoot($);
  await setView($, { isLoading: true });
  const [readRun, tasksRun] = await Promise.all([
    runLore($, root, ["read", id, "--json"]),
    runLore($, root, ["tasks", id, "--json"]),
  ]);
  const result = parseRead(readRun, tasksRun, id);
  if (!result.ok) {
    await setView($, { isLoading: false, error: result.error });
    return;
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
}

async function openConcept($: EngineInterface, id: string): Promise<void> {
  const current = await read($, view);
  const history =
    current.selectedId && current.selectedId !== id
      ? [...current.history, current.selectedId].slice(-50)
      : current.history;
  await loadConcept($, id, { tab: "read", history });
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

// ── The module ────────────────────────────────────────────────────────────────

export const register: Register = (on, _options) => {
  on("session.start", async ($, e, next) => {
    await setView($, { root: await resolveRoot($) });
    await $.command.register({
      name: COMMAND,
      description:
        "Open the Lore pane: browse, read (rendered or raw), search, create and edit this repository’s docs through the lore CLI.",
      // The one argument the command takes, drawn dim after the name so the pane's
      // full-screen toggle is findable without reading its source (`CommandSpec`).
      argumentHint: "full",
    });
    // The remembered size is restored here and ASKED for by the first draw: the
    // session's own surface has not been measured yet (`SessionStartInput` carries
    // no viewport), and a draw is the first moment `e.viewport` exists. The open
    // below is the normal-size request this session starts from, which is what
    // `NORMAL_REQUEST` names for the once-only guard.
    const remembered: PaneMode = (await $.store.get(MODE_KEY)) === "full" ? "full" : "normal";
    await update($, pane, (state) => ({ ...state, mode: remembered }));
    lastRequest = NORMAL_REQUEST;
    void refresh($);
    void countUncommitted($);
    void $.ui.open({ id: PANE, title: "Lore" });
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

  on("command.run", { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase();
    if (arg !== "" && arg !== "full") {
      return { text: `Lore pane: /${COMMAND} takes one argument, \`full\`. "${e.args.trim()}" was not understood.` };
    }
    void refresh($);
    if (arg === "full") {
      // The size is asked for by the draw that follows this state change, which is
      // the only place that knows the viewport; the answer reports the state the
      // pane was left in.
      return { text: modeText(await togglePane($)) };
    }
    // The bare command reopens the pane at the size it already remembers. The
    // command knows its own columns and which layout it runs in, but no rows
    // (`CommandPresentation`), so only the docked arm can be sized from here: an
    // inline one opens at the surface's own share and the draw that follows asks
    // for the height, which is why the guard is left naming what was asked.
    const mode = (await read($, pane)).mode;
    const placement: Placement = e.presentation.isFullscreen ? "dock" : "inline";
    const wanted = mode === "full" && placement === "dock" ? wantedSize(placement, e.presentation.columns, 0) : null;
    lastRequest = requestKey(placement, wanted);
    await requestPane($, placement, wanted);

    return { text: mode === "full" ? modeText("full") : "Lore pane opened." };
  });

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
      mode === "full" ? wantedSize(e.props.placement, e.viewport?.columns ?? 0, e.viewport?.rows ?? 0) : null;
    const request = requestKey(e.props.placement, wanted);
    if (request !== lastRequest) {
      // Recorded before the call, so a draw that runs while the open is in flight
      // does not ask a second time for the same size.
      lastRequest = request;
      void requestPane($, e.props.placement, wanted);
    }
    // The size actually drawn, against the size asked for. Only ever compared in
    // full mode: the normal size is whatever the surface's own share is, so there
    // is nothing there for the pane to have been denied. The hint says the pane is
    // not the size it asked for, which is also what a surface that clamped the
    // request to what the layout spares looks like -- the render event carries the
    // drawn size, not why it is that size, so a drag and a clamp are one signal.
    const drawn = e.props.placement === "dock" ? e.props.bodyColumns : e.props.scroll.bodyRows;
    const shortOfFull = wanted !== null && drawn < wanted - SIZE_SLACK;

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

    // The one line the pane shows instead of claiming a size it did not get. It says
    // what the pane is short of and what to press, and never which of the two ways it
    // got there: the render event carries the drawn size, not its reason.
    const fullHint = shortOfFull ? (
      <Text dimColor wrap="truncate">
        {FULL_HINT}
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
        <Button
          key="full"
          label={mode === "full" ? "Normal size" : "Full screen"}
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
    // and the stacked layout draws under the pane's own chrome.
    return (
      <Box flexDirection="column">
        {tabs}
        {statusLine}
        {fullHint}
        {strip}
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
};
