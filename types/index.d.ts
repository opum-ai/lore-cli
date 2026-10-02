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
  /** Repository-relative path, as `lore read` reports it. */
  path: string;
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
};

declare module "claude-code" {
  interface PluginState {
    "opum-lore": { view: View; catalog: Catalog; doc: DocState; edits: Edits };
  }
}
