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
 * Both writes go through {@link serializeConcept} (canonical key order, frozen YAML config), so an
 * already-canonical concept's other frontmatter and its whole body round-trip byte-for-byte and the
 * wiring is the only diff (ADR-0011).
 *
 * With `--rewrite-links` it additionally repoints **inbound** references to the successor via the
 * shared pure {@link rewriteInbound} engine in `place-only` mode (`move:false`) — the same engine
 * `lore rename` uses to move a concept, here asked only to redirect references. Crucially the two
 * **principals are excluded** from that rewrite: the old doc's own body (it is preserved history)
 * and the new doc's legitimate links *to* the old concept (its predecessor — redirecting them would
 * make the successor link to itself) are left untouched, so only third-party inbound references are
 * redirected. The principals' frontmatter wiring is applied separately and wins.
 *
 * Validation lives here, because the engine's `move:false` path checks only that `oldId` exists
 * (its conflict guard is move-only): both ids must name concepts (`not_found`, exit 3), and the old
 * concept must not already be superseded (`conflict`, exit 5). A bad flag or a self-supersede is a
 * `usage` error (exit 2). All file I/O is here ({@link writeFileOverwriting}, overwrite in place);
 * every link/ref judgement stays pure in `core/rewrite.ts`.
 */

import { join, posix } from "node:path";
import { loadBundle, resolveRef } from "../core/bundle";
import { type Concept, idFromPath, serializeConcept } from "../core/concept";
import { rewriteInbound } from "../core/rewrite";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { writeFileOverwriting } from "./fswrite";

/** The frontmatter `status` value that marks a concept superseded — the lifecycle signal we set and detect. */
const SUPERSEDED_STATUS = "superseded";

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
  /** `--rewrite-links`: also repoint inbound references to the successor. */
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
  /** Every file written (the two principals, plus any repointed inbound files), ascending. */
  readonly files: readonly ChangedFile[];
  /** How many files changed (== `files.length`). */
  readonly filesChanged: number;
  /** Whether `--rewrite-links` repointed inbound references too. */
  readonly rewroteLinks: boolean;
  /** Whether this was a `--dry-run` (nothing was written). */
  readonly dryRun: boolean;
}

/**
 * Run `lore supersede`: parse the arguments, load the bundle, validate both concepts exist and the
 * old one is not already superseded, wire the supersession frontmatter both ways, optionally repoint
 * inbound references to the successor, write the changed files (unless `--dry-run`), emit the
 * `supersede.result`, and return `0`. A bad flag or a self-supersede throws a `usage`
 * {@link LoreError} (exit `2`); a missing id a `not_found` (exit `3`); an already-superseded old id a
 * `conflict` (exit `5`).
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

  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph = loadBundle(docsRoot, { warnings: advisories });

  // The command owns all validation: the engine's `move:false` path checks only that `oldId` exists.
  const oldConcept = graph.concepts.get(oldId);
  if (oldConcept === undefined) {
    throw notFound(oldId);
  }
  const newConcept = graph.concepts.get(newId);
  if (newConcept === undefined) {
    throw notFound(newId);
  }
  assertNotAlreadySuperseded(oldConcept, newId, graph);

  // Wire the two principals' frontmatter (cloned, never mutating the graph snapshot) and serialize
  // byte-stably. The old doc's body is preserved verbatim; only its frontmatter gains the lifecycle
  // keys. The new doc's `supersedes` gains `oldId`, appended to any existing entry.
  const writes = new Map<string, string>();
  if (parsed.rewriteLinks) {
    // Redirect inbound references to the successor, but never the two principals: the old doc keeps
    // its own (historical) body links, and the new doc keeps its legitimate links to its predecessor
    // — repointing either would corrupt the relationship (a self-link on the successor). Their
    // frontmatter wiring below overwrites any plan entry for them.
    const plan = rewriteInbound(graph, oldId, newId, { move: false });
    for (const w of plan.writes) {
      if (w.path === oldConcept.path || w.path === newConcept.path) {
        continue;
      }
      writes.set(w.path, w.bytes);
    }
  }
  writes.set(oldConcept.path, serializeConcept(wireOld(oldConcept, newId)));
  writes.set(newConcept.path, serializeConcept(wireNew(newConcept, oldId, graph)));

  const sorted = new Map([...writes].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));

  if (!parsed.dryRun) {
    for (const [path, bytes] of sorted) {
      writeFileOverwriting(join(docsRoot, path), bytes, `${DOCS_DIR}/${path}`);
    }
  }

  const report = buildReport(oldConcept, newConcept, sorted, parsed);
  emit(reportRenderable(report), options.output, options.stdout);
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  return EXIT_OK;
}

// ── Frontmatter wiring ─────────────────────────────────────────────────────────

/**
 * The old concept with its supersession frontmatter set: `status: superseded` and
 * `superseded_by: <newId>` (the bare-id successor, lore's canonical ref form). Returns a clone — the
 * graph snapshot is never mutated. The body is carried over verbatim, so re-serializing the
 * already-canonical concept changes only these two keys.
 */
function wireOld(concept: Concept, newId: string): Concept {
  return {
    ...concept,
    frontmatter: { ...concept.frontmatter, status: SUPERSEDED_STATUS, superseded_by: newId },
  };
}

/**
 * The new concept with `oldId` appended to its `supersedes`. A concept may supersede several, so an
 * existing entry is **preserved**: an absent `supersedes` becomes the single bare id `oldId`; an
 * existing scalar or list gains `oldId` (normalized to a list when adding a second), unless it
 * already references the old concept — in which case the field is returned unchanged (idempotent,
 * preserving its authored shape). Membership is decided by resolving each existing entry to a
 * concept id via the bundle's own {@link resolveRef}, so a path-form entry that already names the
 * old concept is not duplicated as a bare id.
 */
function wireNew(concept: Concept, oldId: string, graph: { concepts: ReadonlyMap<string, Concept> }): Concept {
  const dir = posix.dirname(concept.path);
  const existing = concept.frontmatter.supersedes;
  const next = appendSupersedes(existing, oldId, dir, graph.concepts);
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
  const alreadyReferences = list.some((item) => typeof item === "string" && resolveRef(item, dir, byId) === oldId);
  if (alreadyReferences) {
    return existing as string | string[];
  }
  return [...list, oldId];
}

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * Reject superseding a concept that is already superseded (`conflict`, exit 5). "Already superseded"
 * is the `status: superseded` lifecycle signal, or an existing `superseded_by` that already resolves
 * to this very successor (a no-op re-run); a `superseded_by` naming a *different* concept is not
 * blocked on its own — `status` is the authoritative signal.
 */
function assertNotAlreadySuperseded(
  oldConcept: Concept,
  newId: string,
  graph: { concepts: ReadonlyMap<string, Concept> },
): void {
  const status = oldConcept.frontmatter.status;
  const statusIsSuperseded = typeof status === "string" && status.trim() === SUPERSEDED_STATUS;
  if (statusIsSuperseded || supersededByNames(oldConcept, newId, graph.concepts)) {
    throw new LoreError(
      "conflict",
      `concept "${oldConcept.id}" is already superseded`,
      "a superseded concept cannot be superseded again; clear its `status`/`superseded_by` first if this is intentional",
      { id: oldConcept.id },
    );
  }
}

/** Whether the old concept's `superseded_by` already resolves to `newId` (the idempotent re-run case). */
function supersededByNames(oldConcept: Concept, newId: string, byId: ReadonlyMap<string, Concept>): boolean {
  const value = oldConcept.frontmatter.superseded_by;
  if (value === undefined || value === null) {
    return false;
  }
  const dir = posix.dirname(oldConcept.path);
  const list = Array.isArray(value) ? value : [value];
  return list.some((item) => typeof item === "string" && resolveRef(item, dir, byId) === newId);
}

/** A `not_found` {@link LoreError} (exit 3) for a concept id absent from the bundle. */
function notFound(id: string): LoreError {
  return new LoreError("not_found", `concept "${id}" is not in the bundle`, "run `lore check` to list concept ids", {
    id,
  });
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `supersede`'s tokens into its two positionals (`<oldId> <newId>`), `--rewrite-links`, and
 * `--dry-run`. The router has already stripped lore's global flags, so a `--`-prefixed token here is
 * a command flag: an unrecognized one is a `usage` error. A `--` ends option parsing so an id may
 * begin with `-`. Mirrors `commands/rename.ts`'s parser.
 */
function parseSupersedeArgs(args: readonly string[]): SupersedeArgs {
  const positionals: string[] = [];
  let rewriteLinks = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const name = arg.slice(2);
      if (name === "rewrite-links") {
        rewriteLinks = true;
      } else if (name === "dry-run") {
        dryRun = true;
      } else {
        throw usage(`unknown option "--${name}"`, "run `lore supersede --help` to list options");
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore supersede --help` to list options");
    } else {
      positionals.push(arg);
    }
  }

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
  return { oldId, newId, rewriteLinks, dryRun };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** Assemble the {@link SupersedeReport} from the principals and the merged writes (repo-relative display paths). */
function buildReport(
  oldConcept: Concept,
  newConcept: Concept,
  writes: Map<string, string>,
  parsed: SupersedeArgs,
): SupersedeReport {
  const files = [...writes.keys()].map((path) => ({ path: `${DOCS_DIR}/${path}` }));
  return {
    old: `${DOCS_DIR}/${oldConcept.path}`,
    new: `${DOCS_DIR}/${newConcept.path}`,
    files,
    filesChanged: files.length,
    rewroteLinks: parsed.rewriteLinks,
    dryRun: parsed.dryRun,
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

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
