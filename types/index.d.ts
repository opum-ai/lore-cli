// The Lore pane's state contract and the shapes the pane draws from.
//
// `.claude-plugin/plugin.json` names this file as the plugin's `types`, and
// `claude plugin validate` holds every `$.state` key the hooks module names to
// what is declared under `PluginState` here. The hooks module imports these
// types with `import type`, so this file carries no runtime code.

/** One concept as Browse lists it. */
export type ConceptSummary = {
  id: string;
  type: string;
  title: string;
};

/** One `lore query` hit as Search draws it. */
export type SearchHit = {
  id: string;
  type: string;
  title: string;
  snippet: string;
};

/** One concept type of the bundle's vocabulary, with its required sections. */
export type TypeInfo = {
  name: string;
  requiredSections: string[];
};

/** One tracker task linked to the open concept, from `lore tasks`. */
export type LinkedTask = {
  id: string;
  title: string;
  status: string;
};

/** The open concept, as Read draws it. */
export type ConceptDoc = {
  id: string;
  /** Bundle-relative path, exactly as `lore read` reports it (`adr/x.md`). */
  path: string;
  /** Repository-relative path (`docs/adr/x.md`), what `lore validate` and `$.fs` address. */
  repoPath: string;
  type: string;
  title: string;
  summary: string | null;
  status: string | null;
  tags: string[];
  /** The authored body (frontmatter stripped). */
  body: string;
  /** The file exactly as on disk, for the Raw view; null until read. */
  raw: string | null;
  tasks: LinkedTask[];
  /** Authored link ids, relative to the bundle; null until fetched. */
  links: { inbound: string[]; outbound: string[] } | null;
};

export type Tab = "browse" | "read" | "search" | "new";

/** The pane's size: its normal size, or the largest the surface allows. */
export type PaneMode = "normal" | "full";

/**
 * The pane's size, as the pane's `z` key and the dashboard tool's `full` leave it.
 *
 * Held in `$.state` so a change redraws the pane, and mirrored into `$.store`
 * under `pane-mode` so the next session opens where this one left off.
 */
export type PaneState = {
  mode: PaneMode;
  /**
   * Whether the last open the module made left the pane OPEN AND UNDRAWN (LCLI-672).
   *
   * The engine places an open nobody asked for by hand only from a floor of terminal
   * columns, so a model's call can leave the pane waiting rather than drawn. This is the
   * module's record of that answer, and it is the band's reading wherever the engine's own
   * listing cannot be had: `$.ui.panes` is where the live answer comes from -- it is what
   * notices the pane being placed by a widened terminal, with no open to ask -- but the
   * engine's test kit carries no such call at all (measured: `$.ui.panes is not a
   * function`), and a listing that fails leaves nothing to read either.
   */
  isWaiting: boolean;
};

/** Which structural action form the Read tab is showing, if any. */
export type Action = "rename" | "supersede" | "link" | "unlink" | null;

export type View = {
  tab: Tab;
  /** The repository root the pane runs lore in (git toplevel of the session cwd). */
  root: string | null;
  /** Search text. */
  query: string;
  /** Type filter; the empty string means every type. */
  typeFilter: string;
  /** Tag filter, comma-free; the empty string means every tag. */
  tagFilter: string;
  /** Read across refs (`lore query --across-refs`) instead of the working tree. */
  acrossRefs: boolean;
  /** The open concept's id, or null. */
  selectedId: string | null;
  /** Back history of previously opened ids, most recent last. */
  history: string[];
  isRaw: boolean;
  action: Action;
  actionValue: string;
  isLoading: boolean;
  error: string | null;
  notice: string | null;
};

export type Catalog = {
  concepts: ConceptSummary[];
  types: TypeInfo[];
  hits: SearchHit[];
};

export type DocState = {
  concept: ConceptDoc | null;
};

/** The New tab's form, and the Fields editor's, as one draft. */
export type Draft = {
  type: string;
  title: string;
  summary: string;
  tags: string;
};

export type Edits = {
  isWriting: boolean;
  /** The New tab's draft. */
  draft: Draft;
  /** The Fields editor's draft while it is open; null when closed. */
  fields: (Draft & { status: string }) | null;
  /** Bundle-relative paths with uncommitted changes, for the landing strip. */
  uncommitted: string[];
  /** Whether the inline body editor is open on the Read tab. */
  bodyEditing: boolean;
  /**
   * The concept the open body editor belongs to, or null when it is closed.
   *
   * `bodyText` is a BODY and `saveBody` pairs it with the open concept's file, so the
   * two have to be bound together: without this, opening a document, editing it and
   * then opening another one would leave the first document's text paired with the
   * second document's file, and Save would write it there.
   */
  bodyDocId: string | null;
  /**
   * The body as the editor last posted it. The live text is the editor instance's
   * own state; this is the pane's copy of it, which Save writes.
   */
  bodyText: string;
  /**
   * Bumped when the pane wants the editor to adopt `bodyText` — opening the editor, or
   * re-opening it on text that changed underneath. The editor adopts on a change and
   * keeps the person's own keystrokes otherwise, so a bump is NOT free: adopting
   * re-creates the instance, which parks the cursor at the end and drops the redo ring.
   * A failed save therefore does not bump: `bodyText` still holds the person's text,
   * the editor's own state is already that text, and re-creating it would only lose
   * their place while they fix what validation complained about.
   */
  bodyRevision: number;
};

declare module "claude-code" {
  interface PluginState {
    "opum-lore": { view: View; catalog: Catalog; doc: DocState; edits: Edits; pane: PaneState };
  }
}
