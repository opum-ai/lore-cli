// LCLI-664. The Lore pane's non-drawing half: how the pane reads what the
// `lore` CLI says.
//
// Nothing in this file receives `$`: the engine's validator refuses a noun of
// `$` passed across an import ("$ is followed only into a function declared in
// this same file, never across an import"), so every `$.noun.method(...)` call
// lives in register.tsx and what crosses this boundary is plain values -- an
// argv to run, the run's own result. Parse stdout alone: `lore` prints lint
// warnings to stderr even under --json, so stderr is read only to explain a
// non-zero exit. Nothing here reimplements a lore behaviour: creation,
// renaming, superseding, linking and validation run the commands themselves,
// because a hand-rolled rename would miss inbound links and a hand-rolled
// validation would disagree with the one CI runs.

import type { ConceptDoc, ConceptSummary, LinkedTask, SearchHit, TypeInfo } from "../types";

// `truncated` is set by the caller from the engine's own isStdoutTruncated /
// isStderrTruncated: the engine caps each stream at its first 4 MiB, and a
// truncated answer is not a parse failure to be reported as one -- it is an
// incomplete answer, and it says so (LCLI-664 review F7).
export type Run = { code: number; stdout: string; stderr: string; truncated?: boolean };

type Envelope = { kind?: unknown; data?: unknown };

const DETAIL_CAP = 300;

function firstLine(text: string): string {
  const line = text.split("\n").find((one) => one.trim().length > 0);

  return line ? line.trim().slice(0, DETAIL_CAP) : "";
}

/** A short, readable failure: lore's own words when it gave any. */
export function failure(run: Run, verb: string): string {
  if (run.truncated) {
    return `${verb}: lore's output was cut off at the engine's 4 MiB cap, so this answer is incomplete; narrow the query`;
  }
  const detail = firstLine(run.stderr) || firstLine(run.stdout);
  if (run.code === -1) {
    return `${verb}: ${detail || "lore could not run (is it on PATH?)"}`;
  }

  return detail ? `${verb} failed (lore exited ${run.code}): ${detail}` : `${verb} failed (lore exited ${run.code})`;
}

/** lore's {schemaVersion, kind, data} envelope, or a readable failure. */
function envelope(run: Run, want: string, verb: string): { data: unknown } | { error: string } {
  if (run.truncated) {
    return { error: failure(run, verb) };
  }
  if (run.code !== 0) {
    return { error: failure(run, verb) };
  }

  let parsed: Envelope;
  try {
    parsed = JSON.parse(run.stdout) as Envelope;
  } catch {
    return { error: `${verb}: could not parse lore's JSON output` };
  }
  if (parsed.kind !== want) {
    return { error: `${verb}: expected ${want}, lore answered ${String(parsed.kind)}` };
  }

  return { data: parsed.data };
}

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

function strings(value: unknown): string[] {
  return asArray(value).flatMap((one) => {
    const text = asString(one);

    return text === null ? [] : [text];
  });
}

// ── Argv builders ─────────────────────────────────────────────────────────────

type FilterView = { typeFilter: string; tagFilter: string; acrossRefs: boolean };

/** The frontmatter filters the pane's chrome adds to either query. */
function filters(view: FilterView): string[] {
  const argv: string[] = [];
  if (view.typeFilter) {
    argv.push("--type", view.typeFilter);
  }
  if (view.tagFilter) {
    argv.push("--tag", view.tagFilter);
  }
  if (view.acrossRefs) {
    // The pane is a view, not a gate: partial cross-ref coverage reports
    // rather than refusing with exit 6.
    argv.push("--across-refs", "--allow-partial");
  }

  return argv;
}

/** `lore query`, no text: the whole bundle under the chrome's filters. */
export function queryArgv(view: FilterView): string[] {
  return ["query", "--json", ...filters(view)];
}

/** `lore query "<text>"` under the chrome's filters. */
export function searchArgv(view: FilterView & { query: string }): string[] {
  // The filters come first and `--` separates them from the text: everything
  // after `--` is positional, so a search term that begins with `-` (or is
  // `--anything`) is a term rather than an unknown option -- measured on lore
  // 0.12.0, `query --json "-foo"` exits 2 with `unknown option "-foo"`, while
  // `query --json -- "-foo"` answers with a query.results envelope (LCLI-664
  // review F5).
  const argv = ["query", "--json", ...filters(view)];
  const text = view.query.trim();
  if (text) {
    argv.push("--", text);
  }

  return argv;
}

/** `lore new <type> "<title>"` with the draft's summary and tags. */
export function newArgv(draft: { type: string; title: string; summary: string; tags: string }): string[] {
  const argv = ["new", draft.type.trim(), draft.title.trim()];
  if (draft.summary.trim()) {
    argv.push("--summary", draft.summary.trim());
  }
  const tags = draft.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 0) {
    argv.push("--tags", tags.join(","));
  }
  argv.push("--json");

  return argv;
}

const ACTION_VERBS: Record<string, string> = {
  rename: "Renamed",
  supersede: "Superseded",
  link: "Linked",
  unlink: "Unlinked",
};

export function actionVerb(action: string): string {
  return ACTION_VERBS[action] ?? action;
}

/** The argv for one structural operation; an empty value is refused here. */
export function actionArgv(
  action: "rename" | "supersede" | "link" | "unlink",
  id: string,
  value: string,
): { argv: string[] } | { error: string } {
  const ids = value.split(/\s+/).filter(Boolean);
  if (ids.length === 0) {
    return { error: "Nothing to apply." };
  }
  const argv =
    action === "rename" || action === "supersede"
      ? [action, id, ids[0] ?? "", "--json"]
      : [action, id, ...ids, "--json"];

  return { argv };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/** The two reads Browse needs: the query hits and the type vocabulary. */
export type Browse = { ok: true; concepts: ConceptSummary[]; types: TypeInfo[] } | { ok: false; error: string };

export type Found = { ok: true; hits: SearchHit[] } | { ok: false; error: string };

export type ReadResult = { ok: true; doc: ConceptDoc } | { ok: false; error: string };

export type Created = { ok: true; id: string | null } | { ok: false; error: string };

export type Outcome = { ok: true } | { ok: false; error: string };

function conceptsFrom(data: unknown): ConceptSummary[] {
  return asArray(asRecord(data).hits).flatMap((hit) => {
    const one = asRecord(hit);
    const id = asString(one.id);
    if (id === null) {
      return [];
    }

    return [{ id, type: asString(one.type) ?? "Concept", title: asString(one.title) ?? id }];
  });
}

function hitsFrom(data: unknown): SearchHit[] {
  return asArray(asRecord(data).hits).flatMap((hit) => {
    const one = asRecord(hit);
    const id = asString(one.id);
    if (id === null) {
      return [];
    }

    return [
      {
        id,
        type: asString(one.type) ?? "Concept",
        title: asString(one.title) ?? id,
        snippet: asString(one.snippet) ?? "",
      },
    ];
  });
}

function typeInfos(data: unknown): TypeInfo[] {
  return asArray(asRecord(data).types).flatMap((entry) => {
    const one = asRecord(entry);
    const name = asString(one.name);
    if (name === null) {
      return [];
    }

    return [{ name, requiredSections: strings(one.requiredSections) }];
  });
}

export function parseBrowse(query: Run, types: Run): Browse {
  const found = envelope(query, "query.results", "Browse");
  if ("error" in found) {
    return { ok: false, error: found.error };
  }
  const report = envelope(types, "types.report", "Types");
  if ("error" in report) {
    return { ok: false, error: report.error };
  }

  return { ok: true, concepts: conceptsFrom(found.data), types: typeInfos(report.data) };
}

export function parseSearch(run: Run): Found {
  const found = envelope(run, "query.results", "Search");
  if ("error" in found) {
    return { ok: false, error: found.error };
  }

  return { ok: true, hits: hitsFrom(found.data) };
}

/** The type vocabulary, or null when the run could not be read. */
export function parseTypes(run: Run): TypeInfo[] | null {
  const report = envelope(run, "types.report", "Types");

  return "error" in report ? null : typeInfos(report.data);
}

function rollupTasks(run: Run): LinkedTask[] {
  const found = envelope(run, "tasks.rollup", "Linked tasks");
  if ("error" in found) {
    // A rollup that cannot be read leaves the strip empty rather than failing
    // the read; the document itself is the point.
    return [];
  }

  return asArray(asRecord(found.data).tasks).flatMap((entry) => {
    const one = asRecord(entry);
    const id = asString(one.id);
    if (id === null) {
      return [];
    }

    return [{ id, title: asString(one.title) ?? "", status: asString(one.status) ?? "" }];
  });
}

export function parseRead(read: Run, tasks: Run, id: string): ReadResult {
  const found = envelope(read, "read.concept", `Read ${id}`);
  if ("error" in found) {
    return { ok: false, error: found.error };
  }
  const data = asRecord(found.data);
  const frontmatter = asRecord(data.frontmatter);
  const doc: ConceptDoc = {
    id: asString(data.id) ?? id,
    path: asString(data.path) ?? "",
    repoPath: repoPathFor(asString(data.path) ?? ""),
    type: asString(data.type) ?? asString(frontmatter.type) ?? "Concept",
    title: asString(frontmatter.title) ?? id,
    summary: asString(frontmatter.summary),
    status: asString(frontmatter.status),
    tags: strings(frontmatter.tags),
    body: asString(data.body) ?? "",
    raw: null,
    tasks: rollupTasks(tasks),
    links: null,
  };

  return { ok: true, doc };
}

/**
 * The repository-relative path of a concept file.
 *
 * `lore read` reports `path` relative to the bundle, and the bundle directory
 * is lore's own constant (`docs/`, src/core/scaffold.ts DOCS_DIR); no CLI
 * surface reports the repository-relative path, so the prefix is applied once
 * here. `lore validate` and `$.fs` both address files from the repository
 * root, which is why the pane carries this as `repoPath`.
 */
export function repoPathFor(bundlePath: string): string {
  // The prefix is unconditional, never guarded on `startsWith("docs/")`: the
  // only producer is `lore read`'s own `path`, which is bundle-relative by
  // contract, so a bundle path that itself begins with `docs/` is a concept
  // inside the bundle's own `docs/` folder (id `docs/x`, file `docs/docs/x.md`)
  // rather than an already-prefixed path. Guarding on the string made that case
  // resolve to `docs/x.md` -- a different file, which the write path would have
  // created and reported as saved (LCLI-664 review F4).
  return `docs/${bundlePath}`;
}

export function parseCreated(run: Run): Created {
  const found = envelope(run, "new.result", "New");
  if ("error" in found) {
    return { ok: false, error: found.error };
  }
  const data = asRecord(found.data);

  return { ok: true, id: asString(data.id) };
}

/**
 * lore emits the full `validate.report` on stdout regardless of outcome and
 * then returns exit 6, so stdout is parsed whatever the exit code; the first
 * error-severity finding's own words come back, never a reimplementation's.
 */
export function parseValidate(run: Run): Outcome {
  if (run.code === 0) {
    return { ok: true };
  }

  let parsed: Envelope;
  try {
    parsed = JSON.parse(run.stdout) as Envelope;
  } catch {
    return { ok: false, error: failure(run, "Validate") };
  }
  if (parsed.kind !== "validate.report") {
    return { ok: false, error: failure(run, "Validate") };
  }
  const report = asRecord(parsed.data);
  const firstError = asArray(report.files)
    .flatMap((file) => asArray(asRecord(file).findings))
    .map(asRecord)
    .find((finding) => finding.severity === "error");
  const message = firstError ? asString(firstError.message) : null;

  return {
    ok: false,
    error: message ? `Validation failed: ${message}` : failure(run, "Validate"),
  };
}

/** Uncommitted Markdown paths from `git status --porcelain`, for the landing strip. */
export function parsePorcelain(stdout: string): string[] {
  return stdout.split("\n").flatMap((line: string) => {
    if (line.trim().length === 0) {
      return [];
    }
    const rest = line.slice(3).trim();
    const path = rest.includes(" -> ") ? (rest.split(" -> ")[1] ?? rest) : rest;

    return path.endsWith(".md") ? [path] : [];
  });
}

// ── Frontmatter editing ───────────────────────────────────────────────────────

/** Renders one value as a YAML double-quoted scalar, valid for any single-line string. */
function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function yamlValue(value: string | string[]): string {
  return Array.isArray(value) ? `[${value.map(yamlScalar).join(", ")}]` : yamlScalar(value);
}

/**
 * Rewrites the named frontmatter keys in `raw`, touching nothing else: an
 * existing top-level line is replaced in place (its indented continuation and
 * block-list lines go with it), a missing key is inserted before the closing
 * fence, and a null removes the line. Values are written as YAML double-quoted
 * scalars, tags as a flow list, so any single-line value survives. The body
 * passes through byte for byte. Returns null when the file carries no
 * frontmatter to edit.
 */
export function patchFrontmatter(raw: string, patch: Record<string, string | string[] | null>): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n?)/u.exec(raw);
  const head = match?.[1];
  if (match === null || head === undefined) {
    return null;
  }
  const pending = new Map(Object.entries(patch));
  const next: string[] = [];
  const lines = head.split("\n");
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    const key = /^([A-Za-z0-9_-]+):/u.exec(line)?.[1];
    if (key !== undefined && pending.has(key)) {
      const value = pending.get(key) ?? null;
      pending.delete(key);
      // Continuation lines of the replaced value go with it.
      while (at + 1 < lines.length && /^[ \t]|^- /u.test(lines[at + 1] ?? "")) {
        at += 1;
      }
      if (value !== null) {
        next.push(`${key}: ${yamlValue(value)}`);
      }
      continue;
    }
    next.push(line);
  }
  for (const [key, value] of pending) {
    if (value !== null) {
      next.push(`${key}: ${yamlValue(value)}`);
    }
  }

  return `---\n${next.join("\n")}\n---${match[2] ?? "\n"}${raw.slice(match[0].length)}`;
}

/**
 * The file's own frontmatter, byte for byte, with everything after it replaced by
 * `body`. `patchFrontmatter` owns the frontmatter; this owns the rest, so the inline
 * editor writes a body and touches nothing above the closing `---`.
 *
 * Returns null for a file with no frontmatter, exactly as `patchFrontmatter` refuses
 * one: a body rewrite that silently dropped a (possibly malformed) frontmatter block
 * would be `lore validate`'s problem to catch afterwards, not this function's to hide.
 * The body is normalised the way the file format expects it — no leading blank lines
 * (the closing delimiter's newline is the separator) and exactly one trailing newline.
 */
export function replaceBody(raw: string, body: string): string | null {
  const match = /^---\r?\n[\s\S]*?\r?\n---(\r?\n?)/u.exec(raw);
  if (match === null) {
    return null;
  }
  const head = raw.slice(0, match[0].length);
  const text = body.replace(/^\n+/u, "").replace(/\n*$/u, "");

  return text === "" ? head : `${head}${text}\n`;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Bodies are long; the pane draws a first slice and says so. */
export const BODY_CAP = 9_500;

export function cap(text: string): string {
  return text.length > BODY_CAP ? text.slice(0, BODY_CAP) : text;
}

export function isCapped(text: string): boolean {
  return text.length > BODY_CAP;
}

/**
 * The largest body the inline editor will open on, and the longest line within it.
 *
 * The engine bounds what a `Client` may be handed and draw: its props and the tree it
 * returns serialize to 100,000 characters, and one `Text` child to 10,000 — "or the
 * instance unmounts". The pane hands the editor the WHOLE body as props, so a body past
 * those bounds does not fail the editor alone: the engine refuses the PANE's render and
 * reports `opum-lore drew nothing on the terminal surface`. Both caps therefore sit
 * under the engine's bounds with room for JSON escaping, which inflates a body full of
 * quotes and newlines past its own length. Measured on Claude Code 2.1.287: a
 * 108,718-character body (`docs/runbooks/release-publishing.md` in this repository)
 * refuses the pane, and 99,000 characters opens cleanly. `Open in editor` has no such
 * bound, and is where a refusal sends the person.
 */
export const EDITOR_BODY_CAP = 90_000;
export const EDITOR_LINE_CAP = 9_000;

/** Whether the inline body editor can open on this body without refusing the pane. */
export function editorFits(body: string): boolean {
  if (body.length > EDITOR_BODY_CAP) {
    return false;
  }

  return !body.split("\n").some((line) => line.length > EDITOR_LINE_CAP);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Whether the body carries the section as a heading. */
export function hasSection(body: string, name: string): boolean {
  return new RegExp(`^#{1,6}\\s+${escapeRegExp(name)}\\s*$`, "imu").test(body);
}

export function requiredSectionsFor(types: TypeInfo[], type: string): string[] {
  return types.find((one) => one.name === type)?.requiredSections ?? [];
}

/** The raw hrefs in the body that look internal, so only those press. */
export function internalHrefs(body: string): string[] {
  const found = new Set<string>();
  const pattern = /\]\(([^)\s]+)\)/gu;
  let match: RegExpExecArray | null = pattern.exec(body);
  while (match !== null && found.size < 256) {
    const href = match[1] ?? "";
    if (href && !/^[a-z][a-z0-9+.-]*:/iu.test(href)) {
      found.add(href.slice(0, 2048));
    }
    match = pattern.exec(body);
  }

  return [...found];
}

/** The bundle id an internal href points at, resolved against the open concept. */
export function bundleIdFor(href: string, fromId: string): string | null {
  const clean = href.split("#")[0] ?? "";
  if (!clean || clean.startsWith("/") || /^[a-z][a-z0-9+.-]*:/iu.test(clean)) {
    return null;
  }
  const parts = [...fromId.split("/").slice(0, -1), ...clean.split("/")];
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  let id = out.join("/");
  if (id.endsWith(".md")) {
    id = id.slice(0, -3);
  }

  return id || null;
}

/** The concepts grouped by type, types in name order. */
export function groupByType(concepts: ConceptSummary[]): { type: string; rows: ConceptSummary[] }[] {
  const groups = new Map<string, ConceptSummary[]>();
  for (const concept of concepts) {
    const rows = groups.get(concept.type) ?? [];
    rows.push(concept);
    groups.set(concept.type, rows);
  }

  return [...groups.entries()].map(([type, rows]) => ({ type, rows })).sort((a, b) => a.type.localeCompare(b.type));
}
