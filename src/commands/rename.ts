/**
 * commands/rename.ts — `lore rename <oldId> <newId> [--dry-run]`.
 *
 * The thin, side-effecting layer over the pure inbound-rewrite engine (cli-surface §rename,
 * LORE-35 AC#2): it parses the command's own arguments, loads the `docs/` bundle graph, asks
 * {@link rewriteInbound} for the move plan — relocate the concept and repoint every inbound
 * cross-link and frontmatter ref — regenerates the affected `index.md` listing blocks against the
 * post-rename graph, writes the changed files, moves the renamed file and deletes its old path
 * (unless `--dry-run`), renders the report, and returns the exit code. All file I/O lives here;
 * every link/ref judgement lives in `core/rewrite.ts`, and the byte-stable concept serialization
 * in `core/concept.ts`.
 *
 * Index regeneration composes on top of the rewrite: the renamed concept's old directory loses a
 * listing entry and its new directory gains one, so the bundle's `index.md` hubs are regenerated
 * from the **post-rename** graph ({@link generateIndexes}) and spliced into the already-rewritten
 * index bytes — only index files whose bytes actually change are written, so an unrelated, already
 * canonical hub is never churned.
 *
 * A bad flag or a missing/duplicate id is a `usage` error (exit 2); an absent `oldId` a
 * `not_found` (exit 3, from the engine); an already-taken `newId` a `conflict` (exit 5) — all
 * funnel through the router's one error seam like every command.
 */

import { existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { type BundleGraph, buildGraph, loadBundle, walkMarkdown } from "../core/bundle";
import { type Concept, idFromPath, parseConcept } from "../core/concept";
import { generateIndexes, INDEX_BLOCK_BEGIN, INDEX_BLOCK_END, locateManagedBlock } from "../core/indexes";
import { type RewritePlan, rewriteInbound } from "../core/rewrite";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { assertNotReservedStem, parseCommandArgs, usage } from "./args";
import { canonicalIdentity, readSource } from "./discover";
import { ensureDir, moveFile, writeFileOverwriting } from "./fswrite";

/** The reserved index file name, regenerated from the post-rename graph rather than spliced as a link. */
const INDEX_FILE = "index.md";

/** Options for {@link runRename}; `root` and the streams are injectable for tests. */
export interface RenameOptions {
  /** The repo root the `docs/` bundle resolves against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `rename`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for bundle-load advisories; defaults to `process.stderr`. */
  stderr?: Writer;
}

/** The parsed form of `lore rename`'s arguments. */
interface RenameArgs {
  /** The concept id (or path) to rename from. */
  oldId: string;
  /** The concept id (or path) to rename to. */
  newId: string;
  /** `--dry-run`: report what would change, write nothing. */
  dryRun: boolean;
}

/** One written file, for the report. */
interface ChangedFile {
  /** Repo-relative POSIX path of the written file. */
  readonly path: string;
}

/** The `rename.result` payload: the relocation and the files written. */
export interface RenameReport {
  /** The renamed file's old repo-relative path. */
  readonly from: string;
  /** The renamed file's new repo-relative path. */
  readonly to: string;
  /** Every file written (the moved file, repointed inbound files, regenerated indexes), ascending. */
  readonly files: readonly ChangedFile[];
  /** How many files changed (== `files.length`). */
  readonly filesChanged: number;
  /** Whether this was a `--dry-run` (nothing was written). */
  readonly dryRun: boolean;
}

/**
 * Run `lore rename`: parse the arguments, load the bundle, plan the move + inbound rewrite,
 * regenerate the affected indexes, write the changed files and relocate the renamed file (unless
 * `--dry-run`), emit the `rename.result`, and return `0`. A bad flag or duplicate id throws a
 * `usage` {@link LoreError} (exit `2`); an absent `oldId` a `not_found` (exit `3`); a taken `newId`
 * a `conflict` (exit `5`).
 */
export function runRename(options: RenameOptions): number {
  const parsed = parseRenameArgs(options.args);
  const oldId = idFromPath(parsed.oldId);
  const newId = idFromPath(parsed.newId);
  if (oldId === newId) {
    throw new LoreError("usage", "the old and new id are the same", "pass a different target id to rename to", {
      id: oldId,
    });
  }
  // A concept may not be renamed onto a reserved, machine-owned file name (index.md/log.md): those
  // are regenerated wholesale, so the relocated content would be silently clobbered.
  assertNotReservedStem(newId, "rename to");

  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph = loadBundle(docsRoot, { warnings: advisories });

  // Plan the move + inbound rewrite (throws not_found if oldId is absent / conflict if newId is a
  // concept), then regenerate the index hubs against the post-rename graph and merge them over the
  // plan's writes (index regen wins).
  const plan = rewriteInbound(graph, oldId, newId, { move: true });
  // The engine's conflict check is graph-only; guard the filesystem too, so a target that collides
  // with a NON-concept file (a hand-written index, a doc with no/invalid frontmatter) or with a
  // concept differing only in case (which a case-sensitive `Map.has` misses) is never overwritten.
  // A target resolving to the *same* inode as the source is a legitimate case-only rename, allowed.
  assertTargetFree(plan, docsRoot);
  const writes = mergeIndexWrites(plan, graph, docsRoot);

  if (!parsed.dryRun) {
    commitWrites(writes, plan, docsRoot);
  }

  const report = buildReport(plan, writes, parsed.dryRun);
  emit(reportRenderable(report), options.output, options.stdout);
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  return EXIT_OK;
}

// ── Filesystem commit ──────────────────────────────────────────────────────────

/**
 * Reject a rename whose destination is already occupied on disk by anything other than the source
 * file itself. The engine's `graph.concepts.has(to)` guard is case-sensitive and concept-only; this
 * closes the two gaps it leaves on a case-insensitive filesystem and against non-concept files. A
 * destination that resolves to the **same physical file** as the source is a case-only rename and
 * is permitted (the relocation renames the inode rather than clobbering it).
 */
function assertTargetFree(plan: RewritePlan, docsRoot: string): void {
  if (plan.rename === null) {
    return;
  }
  const absTo = join(docsRoot, plan.rename.to);
  const absFrom = join(docsRoot, plan.rename.from);
  if (existsSync(absTo) && canonicalIdentity(absTo) !== canonicalIdentity(absFrom)) {
    throw new LoreError(
      "conflict",
      `cannot rename to "${plan.rename.to}": a file already exists at that path`,
      "choose a target path that is not already taken (concept or not), or remove the conflicting file",
      { path: `${DOCS_DIR}/${plan.rename.to}` },
    );
  }
}

/**
 * Commit the planned writes to disk. Parent directories are created up front (so a target in a
 * brand-new category directory does not fail with ENOENT), the in-place rewrites are written, and
 * the renamed file is relocated **last** by {@link moveFile} — its new bytes are written into the
 * source path and then the inode is renamed, which is atomic and safe even for a case-only rename
 * on a case-insensitive filesystem. (A mid-commit IO failure can still leave the bundle partially
 * rewritten — cross-file transactional rollback is a shared concern with `lore replace`, deferred.)
 */
function commitWrites(writes: Map<string, string>, plan: RewritePlan, docsRoot: string): void {
  const movedTo = plan.rename?.to;
  for (const [path, bytes] of writes) {
    if (path === movedTo) {
      continue; // the moved file is relocated below, not written at its new path here
    }
    const abs = join(docsRoot, path);
    ensureDir(dirname(abs), `${DOCS_DIR}/${path}`);
    writeFileOverwriting(abs, bytes, `${DOCS_DIR}/${path}`);
  }
  if (plan.rename !== null) {
    const absFrom = join(docsRoot, plan.rename.from);
    const absTo = join(docsRoot, plan.rename.to);
    ensureDir(dirname(absTo), `${DOCS_DIR}/${plan.rename.to}`);
    // Write the new bytes into the source file, then rename the source to its destination — never
    // write-new-then-delete-old, which would destroy a case-only rename's single inode.
    writeFileOverwriting(absFrom, writes.get(plan.rename.to) ?? "", `${DOCS_DIR}/${plan.rename.from}`);
    moveFile(absFrom, absTo, `${DOCS_DIR}/${plan.rename.to}`);
  }
}

// ── Index regeneration ───────────────────────────────────────────────────────────

/**
 * Merge the plan's concept rewrites with the regenerated `index.md` hubs, returning the final
 * `path → bytes` writes (bundle-relative paths, ascending). Index regeneration runs over the
 * **post-rename** graph and splices into the already-rewritten index bytes, so a hub whose listing
 * gains/loses the renamed concept is updated while its frontmatter and prose are preserved; a hub
 * whose regenerated bytes equal the on-disk bytes is dropped, so an unrelated canonical index is
 * never written.
 */
function mergeIndexWrites(plan: RewritePlan, graph: BundleGraph, docsRoot: string): Map<string, string> {
  const planByPath = new Map(plan.writes.map((w) => [w.path, w.bytes] as const));

  // Current on-disk bytes of every index file, the determinism seam generateIndexes splices into —
  // overridden by the plan's rewritten bytes where a (concept) index was already repointed.
  const diskIndexBytes = readIndexBytes(docsRoot);
  const existing = new Map(diskIndexBytes);
  for (const [path, bytes] of planByPath) {
    if (posix.basename(path) === INDEX_FILE) {
      existing.set(path, bytes);
    }
  }

  const postRename = buildPostRenameGraph(graph, plan);
  const regenerated = generateIndexes(postRename, { existing });

  // Start from the plan's writes, then let index regeneration win for any index path. An index
  // whose regenerated bytes equal what is already on disk is a no-op and is skipped.
  const writes = new Map(planByPath);
  for (const [path, bytes] of regenerated) {
    if (bytes === diskIndexBytes.get(path)) {
      writes.delete(path); // unchanged hub — drop a plan entry too (none expected) and don't write
    } else {
      writes.set(path, bytes);
    }
  }

  // A cross-directory rename can empty a directory of its last concept; generateIndexes only emits
  // an index for a directory that still holds a concept, so that directory's on-disk index.md keeps
  // a now-dead link to the moved file in its machine-owned block. Regenerate those to an empty
  // listing so no stale link survives in a managed region.
  if (plan.rename !== null) {
    for (const dir of emptiedDirs(plan.rename.from, postRename)) {
      const indexPath = `${dir}/${INDEX_FILE}`;
      const disk = diskIndexBytes.get(indexPath);
      if (disk === undefined || regenerated.has(indexPath)) {
        continue; // no such index, or it was already regenerated (the dir still has concepts)
      }
      const emptied = spliceEmptyListing(disk);
      if (emptied !== disk) {
        writes.set(indexPath, emptied);
      }
    }
  }
  return new Map([...writes].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}

/**
 * The ancestor directories of `fromPath` (its directory up to, but excluding, the bundle root) that
 * hold no concept after the rename — the directories a cross-directory move may have emptied. The
 * root is excluded because generateIndexes always regenerates the root index.
 */
function emptiedDirs(fromPath: string, postRename: BundleGraph): string[] {
  const concepts = [...postRename.concepts.values()];
  const dirs: string[] = [];
  let dir = posix.dirname(fromPath);
  while (dir !== "" && dir !== "." && dir !== "/") {
    const prefix = `${dir}/`;
    if (!concepts.some((c) => c.path.startsWith(prefix))) {
      dirs.push(dir);
    }
    dir = posix.dirname(dir);
  }
  return dirs;
}

/**
 * Replace an index file's managed listing block with an **empty** listing (the same bytes
 * generateIndexes emits for a concept-less directory), preserving every other byte. Returns the
 * input unchanged when it carries no managed block (nothing lore owns to regenerate).
 */
function spliceEmptyListing(content: string): string {
  const bounds = locateManagedBlock(content, INDEX_BLOCK_BEGIN, INDEX_BLOCK_END);
  if (bounds === null) {
    return content;
  }
  const block = `${INDEX_BLOCK_BEGIN}\n\n${INDEX_BLOCK_END}`;
  const tail = content.slice(bounds.end);
  const spliced = content.slice(0, bounds.start) + block + tail;
  return tail === "" ? `${spliced}\n` : spliced;
}

/** Read every existing `index.md` under the bundle as `bundle-relative-path → raw bytes`. */
function readIndexBytes(docsRoot: string): Map<string, string> {
  const bytes = new Map<string, string>();
  for (const rel of walkMarkdown(docsRoot, undefined)) {
    if (posix.basename(rel) === INDEX_FILE) {
      bytes.set(rel, readSource(join(docsRoot, rel), `${DOCS_DIR}/${rel}`));
    }
  }
  return bytes;
}

/**
 * Rebuild the bundle graph as it will be **after** the rename, so index regeneration lists the
 * renamed concept at its new path. Every concept the plan rewrote is re-parsed from its new bytes
 * (the moved concept from its new path, so it re-ids to `newId`); every untouched concept is
 * carried over verbatim. The plan's bytes came from a validating serialize, so re-parse cannot fail.
 */
function buildPostRenameGraph(graph: BundleGraph, plan: RewritePlan): BundleGraph {
  const newBytesByPath = new Map(plan.writes.map((w) => [w.path, w.bytes] as const));
  const movedFrom = plan.rename?.from;
  const movedTo = plan.rename?.to;

  const concepts: Concept[] = [];
  for (const concept of graph.concepts.values()) {
    if (concept.path === movedFrom && movedTo !== undefined) {
      concepts.push(parseConcept(movedTo, newBytesByPath.get(movedTo) ?? "")); // moved → new path/id
    } else {
      const rewritten = newBytesByPath.get(concept.path);
      concepts.push(rewritten === undefined ? concept : parseConcept(concept.path, rewritten));
    }
  }
  return buildGraph(concepts);
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `rename`'s tokens into its two positionals (`<oldId> <newId>`) and `--dry-run`, via the
 * shared {@link parseCommandArgs} tokenizer (mirrors `commands/supersede.ts`/`commands/link.ts`'s
 * parsers). Positional arity is validated here since it differs per command.
 */
function parseRenameArgs(args: readonly string[]): RenameArgs {
  const { positionals, flags } = parseCommandArgs(args, "rename", ["dry-run"]);

  const oldId = positionals[0];
  if (oldId === undefined) {
    throw usage("`lore rename` needs an old and a new id", "run `lore rename <oldId> <newId>`");
  }
  const newId = positionals[1];
  if (newId === undefined) {
    throw usage("`lore rename` needs a new id", "pass the target id, e.g. `lore rename stories/old stories/new`");
  }
  if (positionals.length > 2) {
    throw usage(
      `unexpected argument "${positionals[2]}"`,
      "pass exactly an old and a new id; scope nothing else (rename rewrites the whole bundle)",
    );
  }
  return { oldId, newId, dryRun: flags.has("dry-run") };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** Assemble the {@link RenameReport} from the plan and the merged writes (repo-relative display paths). */
function buildReport(plan: RewritePlan, writes: Map<string, string>, dryRun: boolean): RenameReport {
  const files = [...writes.keys()].map((path) => ({ path: `${DOCS_DIR}/${path}` }));
  return {
    from: plan.rename ? `${DOCS_DIR}/${plan.rename.from}` : "",
    to: plan.rename ? `${DOCS_DIR}/${plan.rename.to}` : "",
    files,
    filesChanged: files.length,
    dryRun,
  };
}

/** The per-result-type rendering bundle for `rename` (output.ts dispatches on the mode). */
function reportRenderable(data: RenameReport): Renderable<RenameReport> {
  return {
    kind: "rename.result",
    data,
    pretty: (report) => render(report),
    plain: (report) => render(report),
  };
}

/** The relocation line, one line per other changed file, then a summary. (No color: no severities.) */
function render(data: RenameReport): string {
  const verb = data.dryRun ? "would rename" : "renamed";
  const lines = [`${verb} ${data.from} -> ${data.to}`];
  for (const file of data.files) {
    if (file.path !== data.to) {
      lines.push(`${data.dryRun ? "would update" : "updated"} ${file.path}`);
    }
  }
  const noun = data.filesChanged === 1 ? "file" : "files";
  lines.push(`${data.filesChanged} ${noun} changed${data.dryRun ? " (dry-run)" : ""}`);
  return lines.join("\n");
}
