/**
 * commands/supersede.ts — `lore supersede <oldId> <newId> [--rewrite-links] [--dry-run]`.
 *
 * The thin, side-effecting layer that records a supersession relationship between two existing
 * concepts (cli-surface §supersede, the third of LORE-35's refactoring commands; LORE-35 AC: the
 * supersede half). Unlike {@link runRename}, it **preserves the old file** as history — nothing
 * moves or is deleted — and only edits frontmatter:
 *
 * - on the **old** concept: `status: superseded` + `superseded_by: <newId>` (the successor, bare id);
 * - on the **new** concept: `supersedes: <oldId>`, **appended** to any existing entry (a concept may
 *   supersede several) rather than clobbering it.
 *
 * Both writes go through {@link serializeConcept} under the **active profile** (so the `status` value
 * is validated against the project's own profile, not just the default — a custom `status` enum that
 * forbids `superseded` fails fast here rather than slipping through to break the next `lore validate`),
 * in canonical key order with the frozen YAML config, so an already-canonical concept's other
 * frontmatter and its whole body round-trip byte-for-byte and the wiring is the only diff (ADR-0011).
 *
 * With `--rewrite-links` it additionally repoints **inbound body links** to the successor via the
 * shared pure {@link rewriteInbound} engine in place-only (`move:false`) mode, with two restrictions
 * that distinguish supersede from rename (whose machinery it reuses):
 *
 * - `rewriteFrontmatterRefs:false` — because the old file is **preserved**, a third party's
 *   `supersedes`/`superseded_by`/`specs` ref to it remains a true historical record; repointing it
 *   would fabricate a relationship that never happened. Only navigational body links are redirected.
 * - `exclude` the two **principals** and the machine-owned `index.md`/`log.md` hubs — the old doc's
 *   own (historical) body links and the new doc's legitimate links *to* its predecessor must stay
 *   intact (else the successor links to itself), and a generated hub is never hand-rewritten (its
 *   file listing is unchanged, since supersede moves nothing).
 *
 * Validation lives here, because the engine's `move:false` path checks only that `oldId` exists (its
 * conflict guard is move-only): both ids must name concepts (`not_found`, exit 3); neither may be a
 * reserved hub name (`usage`, exit 2); and the old concept must not already be superseded —
 * `status: superseded` (any case) **or** an already-recorded `superseded_by` — which would otherwise
 * be silently overwritten (`conflict`, exit 5). All file I/O is here
 * ({@link writeFileOverwriting}, overwrite in place); every link/ref judgement stays pure in
 * `core/rewrite.ts`.
 */

import { join, posix } from "node:path";
import { conceptNotInBundle, loadBundle, resolveRef } from "../core/bundle";
import { type Concept, idFromPath, serializeConcept } from "../core/concept";
import { loadProfile } from "../core/profile";
import { rewriteInbound } from "../core/rewrite";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, usage } from "./args";
import { writeFileOverwriting } from "./fswrite";

/** The frontmatter `status` value that marks a concept superseded — the lifecycle signal we set and detect. */
const SUPERSEDED_STATUS = "superseded";

/**
 * Reserved file stems that name machine-generated hubs (`index.md`, `log.md`): a concept may never be
 * a supersede principal under one of these, and they are excluded from `--rewrite-links` — they are
 * regenerated wholesale by `lore sync`, not authored concepts. Mirrors `lore rename`'s guard.
 */
const RESERVED_STEMS: ReadonlySet<string> = new Set(["index", "log"]);

/** Options for {@link runSupersede}; `root` and the streams are injectable for tests. */
export interface SupersedeOptions {
  /** The repo root the `docs/` bundle resolves against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `supersede`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for bundle-load advisories; defaults to `process.stderr`. */
  stderr?: Writer;
}

/** The parsed form of `lore supersede`'s arguments. */
interface SupersedeArgs {
  /** The concept id (or path) being superseded. */
  oldId: string;
  /** The successor concept id (or path). */
  newId: string;
  /** `--rewrite-links`: also repoint inbound body links to the successor. */
  rewriteLinks: boolean;
  /** `--dry-run`: report what would change, write nothing. */
  dryRun: boolean;
}

/** One written file, for the report. */
interface ChangedFile {
  /** Repo-relative POSIX path of the written file. */
  readonly path: string;
}

/** The `supersede.result` payload: the wired relationship and every file written. */
export interface SupersedeReport {
  /** The superseded concept's repo-relative path. */
  readonly old: string;
  /** The successor concept's repo-relative path. */
  readonly new: string;
  /** Every file written (the principals that changed, plus any repointed inbound files), ascending. */
  readonly files: readonly ChangedFile[];
  /** How many files changed (== `files.length`). */
  readonly filesChanged: number;
  /** Whether any inbound body link was actually repointed (not merely whether `--rewrite-links` was passed). */
  readonly rewroteLinks: boolean;
  /** Whether this was a `--dry-run` (nothing was written). */
  readonly dryRun: boolean;
}

/**
 * Run `lore supersede`: parse the arguments, load the bundle and active profile, validate both
 * concepts exist and the old one is not already superseded, wire the supersession frontmatter both
 * ways, optionally repoint inbound body links to the successor, write the changed files (unless
 * `--dry-run`), emit the `supersede.result`, and return `0`. A bad flag / self-supersede / reserved
 * id throws a `usage` {@link LoreError} (exit `2`); a missing id a `not_found` (exit `3`); an
 * already-superseded old id a `conflict` (exit `5`).
 */
export function runSupersede(options: SupersedeOptions): number {
  const parsed = parseSupersedeArgs(options.args);
  const oldId = idFromPath(parsed.oldId);
  const newId = idFromPath(parsed.newId);
  if (oldId === newId) {
    throw new LoreError("usage", "a concept cannot supersede itself", "pass a different successor id", {
      id: oldId,
    });
  }
  assertNotReserved(oldId);
  assertNotReserved(newId);

  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph = loadBundle(docsRoot, { warnings: advisories });
  const profile = loadProfile({ root: options.root });

  // The command owns all validation: the engine's `move:false` path checks only that `oldId` exists.
  const oldConcept = graph.concepts.get(oldId);
  if (oldConcept === undefined) {
    throw conceptNotInBundle(oldId);
  }
  const newConcept = graph.concepts.get(newId);
  if (newConcept === undefined) {
    throw conceptNotInBundle(newId);
  }
  assertNotAlreadySuperseded(oldConcept);

  // Optionally repoint inbound body links to the successor. The principals and the machine-owned
  // hubs are excluded (the engine never even parses them), and frontmatter refs are left intact —
  // the old file is preserved, so a ref to it is valid history, not a dead pointer.
  const writes = new Map<string, string>();
  let rewroteLinks = false;
  if (parsed.rewriteLinks) {
    const plan = rewriteInbound(graph, oldId, newId, {
      move: false,
      rewriteFrontmatterRefs: false,
      exclude: excludedFromRewrite(graph, oldConcept.path, newConcept.path),
    });
    for (const w of plan.writes) {
      writes.set(w.path, w.bytes);
    }
    rewroteLinks = writes.size > 0;
  }

  // Wire the principals' frontmatter (cloned, never mutating the graph snapshot) and serialize under
  // the active profile. The old doc always changes (it gains the lifecycle keys); the new doc is
  // written only when its `supersedes` actually changes, so a no-op append is not reported as a write.
  writes.set(oldConcept.path, serializeConcept(wireOld(oldConcept, newId), { profile }));
  const wiredNew = wireNew(newConcept, oldId, graph);
  if (wiredNew !== null) {
    writes.set(newConcept.path, serializeConcept(wiredNew, { profile }));
  }

  const sorted = new Map([...writes].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));

  if (!parsed.dryRun) {
    for (const [path, bytes] of sorted) {
      writeFileOverwriting(join(docsRoot, path), bytes, `${DOCS_DIR}/${path}`);
    }
  }

  const report = buildReport(oldConcept, newConcept, sorted, { rewroteLinks, dryRun: parsed.dryRun });
  emit(reportRenderable(report), options.output, options.stdout);
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  return EXIT_OK;
}

/**
 * The concept ids `--rewrite-links` must never touch: the two principals (the command wires their
 * frontmatter itself) and every machine-owned `index.md`/`log.md` hub in the bundle (regenerated by
 * `lore sync`, not hand-rewritten — and since supersede moves nothing, their listings are unchanged).
 */
function excludedFromRewrite(
  graph: { concepts: ReadonlyMap<string, Concept> },
  oldPath: string,
  newPath: string,
): ReadonlySet<string> {
  const ids = new Set<string>([idFromPath(oldPath), idFromPath(newPath)]);
  for (const id of graph.concepts.keys()) {
    if (RESERVED_STEMS.has(posix.basename(id))) {
      ids.add(id);
    }
  }
  return ids;
}

// ── Frontmatter wiring ─────────────────────────────────────────────────────────

/**
 * The old concept with its supersession frontmatter set: `status: superseded` and
 * `superseded_by: <newId>` (the bare-id successor, lore's canonical ref form). Returns a clone — the
 * graph snapshot is never mutated. The body is carried over verbatim, so re-serializing the
 * already-canonical concept changes only these two keys. Safe to overwrite `superseded_by`
 * unconditionally because {@link assertNotAlreadySuperseded} has already rejected a concept that
 * carries one.
 */
function wireOld(concept: Concept, newId: string): Concept {
  return {
    ...concept,
    frontmatter: { ...concept.frontmatter, status: SUPERSEDED_STATUS, superseded_by: newId },
  };
}

/**
 * The new concept with `oldId` appended to its `supersedes`, or `null` when that is a no-op (the
 * concept already references the old one) — so an unchanged successor is neither rewritten nor
 * counted. A concept may supersede several, so an existing entry is **preserved**: an absent
 * `supersedes` becomes the single bare id `oldId`; an existing scalar or list gains `oldId`
 * (normalized to a list when adding a second). Membership is decided by resolving each existing entry
 * to a concept id via the bundle's own {@link resolveRef}, so a path-form entry that already names
 * the old concept is not duplicated as a bare id.
 */
function wireNew(concept: Concept, oldId: string, graph: { concepts: ReadonlyMap<string, Concept> }): Concept | null {
  const dir = posix.dirname(concept.path);
  const existing = concept.frontmatter.supersedes;
  const next = appendSupersedes(existing, oldId, dir, graph.concepts);
  if (next === existing) {
    return null; // already references the old concept — nothing to write
  }
  return { ...concept, frontmatter: { ...concept.frontmatter, supersedes: next } };
}

/** Compute the new `supersedes` value, appending `oldId` (bare id) unless it is already referenced. */
function appendSupersedes(
  existing: unknown,
  oldId: string,
  dir: string,
  byId: ReadonlyMap<string, Concept>,
): string | string[] {
  if (existing === undefined || existing === null) {
    return oldId;
  }
  const list = Array.isArray(existing) ? existing : [existing];
  if (list.some((item) => typeof item === "string" && resolveRef(item, dir, byId) === oldId)) {
    return existing as string | string[]; // already references the old concept — preserve as-is
  }
  return [...list, oldId];
}

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * Reject superseding a concept that is already superseded (`conflict`, exit 5). "Already superseded"
 * is either the `status: superseded` lifecycle signal (matched case-insensitively, since `status` is
 * a free-form string) **or** an already-recorded `superseded_by` — the structured field
 * {@link wireOld} would otherwise silently overwrite, discarding the concept's real recorded
 * successor.
 */
function assertNotAlreadySuperseded(oldConcept: Concept): void {
  if (hasRecordedSuccessor(oldConcept) || statusIsSuperseded(oldConcept)) {
    throw new LoreError(
      "conflict",
      `concept "${oldConcept.id}" is already superseded`,
      "a superseded concept cannot be superseded again; clear its `status`/`superseded_by` first if this is intentional",
      { id: oldConcept.id },
    );
  }
}

/** Whether the concept already records a successor (`superseded_by` set to a non-empty value). */
function hasRecordedSuccessor(concept: Concept): boolean {
  const value = concept.frontmatter.superseded_by;
  if (value === undefined || value === null) {
    return false;
  }
  return !(Array.isArray(value) && value.length === 0);
}

/** Whether the concept's `status` is `superseded`, matched case-insensitively (status is free-form text). */
function statusIsSuperseded(concept: Concept): boolean {
  const status = concept.frontmatter.status;
  return typeof status === "string" && status.trim().toLowerCase() === SUPERSEDED_STATUS;
}

/** Reject a reserved hub name (`index`/`log`) as either supersede principal — a `usage` error. */
function assertNotReserved(id: string): void {
  if (RESERVED_STEMS.has(posix.basename(id))) {
    throw new LoreError(
      "usage",
      `cannot supersede "${id}": "${posix.basename(id)}" is a reserved, machine-generated file name`,
      "index.md/log.md are generated by lore, not authored concepts",
      { id },
    );
  }
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `supersede`'s tokens into its two positionals (`<oldId> <newId>`), `--rewrite-links`, and
 * `--dry-run`, via the shared {@link parseCommandArgs} tokenizer (mirrors
 * `commands/rename.ts`/`commands/link.ts`'s parsers). Positional arity is validated here since it
 * differs per command.
 */
function parseSupersedeArgs(args: readonly string[]): SupersedeArgs {
  const { positionals, flags } = parseCommandArgs(args, "supersede", ["rewrite-links", "dry-run"]);

  const oldId = positionals[0];
  if (oldId === undefined) {
    throw usage("`lore supersede` needs an old and a new id", "run `lore supersede <oldId> <newId>`");
  }
  const newId = positionals[1];
  if (newId === undefined) {
    throw usage(
      "`lore supersede` needs a successor id",
      "pass the successor id, e.g. `lore supersede adr/0007-old adr/0012-new`",
    );
  }
  if (positionals.length > 2) {
    throw usage(
      `unexpected argument "${positionals[2]}"`,
      "pass exactly an old and a new id; scope nothing else (supersede wires the whole bundle)",
    );
  }
  return { oldId, newId, rewriteLinks: flags.has("rewrite-links"), dryRun: flags.has("dry-run") };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** Assemble the {@link SupersedeReport} from the principals and the merged writes (repo-relative display paths). */
function buildReport(
  oldConcept: Concept,
  newConcept: Concept,
  writes: Map<string, string>,
  flags: { rewroteLinks: boolean; dryRun: boolean },
): SupersedeReport {
  const files = [...writes.keys()].map((path) => ({ path: `${DOCS_DIR}/${path}` }));
  return {
    old: `${DOCS_DIR}/${oldConcept.path}`,
    new: `${DOCS_DIR}/${newConcept.path}`,
    files,
    filesChanged: files.length,
    rewroteLinks: flags.rewroteLinks,
    dryRun: flags.dryRun,
  };
}

/** The per-result-type rendering bundle for `supersede` (output.ts dispatches on the mode). */
function reportRenderable(data: SupersedeReport): Renderable<SupersedeReport> {
  return {
    kind: "supersede.result",
    data,
    pretty: (report) => render(report),
    plain: (report) => render(report),
  };
}

/** The supersession line, one line per other changed file, then a summary. (No color: no severities.) */
function render(data: SupersedeReport): string {
  const verb = data.dryRun ? "would supersede" : "superseded";
  const lines = [`${verb} ${data.old} -> ${data.new}`];
  for (const file of data.files) {
    if (file.path !== data.old && file.path !== data.new) {
      lines.push(`${data.dryRun ? "would update" : "updated"} ${file.path}`);
    }
  }
  const noun = data.filesChanged === 1 ? "file" : "files";
  lines.push(`${data.filesChanged} ${noun} changed${data.dryRun ? " (dry-run)" : ""}`);
  return lines.join("\n");
}
