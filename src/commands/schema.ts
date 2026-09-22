/**
 * commands/schema.ts — `lore schema export [--out <dir>] [--type <T>]`.
 *
 * The thin, side-effecting layer that materializes the active profile's editor JSON Schemas
 * (cli-surface §schema; LORE-20). It loads the profile, asks core for the exact bytes per type via
 * the shared {@link emitSchemaFiles} — the **same** emitter `lore init` uses, so an exported schema
 * is byte-identical to the scaffolded one — and writes each file under `--out` (default
 * `.lore/schemas/`), **overwriting** so a re-export refreshes the bytes after a profile change.
 *
 * A **full** export (no `--type`) to the **default** `.lore/schemas/` directory also **prunes** any
 * orphaned `<slug>.schema.json` left there by a type that the profile no longer declares, so
 * `.lore/schemas/` always mirrors the active profile rather than drifting (a stale schema would
 * otherwise keep driving editor validation from a removed type's rules) — but ONLY an orphan whose
 * generator stamp matches this binary's profile digest (LCLI-565); an unattributable orphan (stamp from
 * another profile, or none) is kept and reported as `keptUnattributable`. Pruning never runs against a
 * non-default `--out`: that directory isn't lore-owned, so a pre-existing `*.schema.json` sitting
 * there — including one placed by an unrelated tool — must never be silently deleted. A single-`--type`
 * export touches only that type's own files and prunes nothing — "files" plural since LCLI-553,
 * because a type with deprecated aliases emits a byte-identical schema per alias spelling beside
 * its canonical one; it still never touches another TYPE's file.
 *
 * The emitted Draft-7 schemas are what makes the `# yaml-language-server: $schema=…` modeline `lore
 * new`/`lore init` stamp resolve, driving YAML autocomplete in VS Code/Obsidian (AC#1); because the
 * profile is loaded from the project's `.lore/profile.toml`, a custom type's schema is exported too
 * (AC#2). With no profile present this is the built-in story-convention profile (zero-config). Those
 * stamped modelines point at the default `.lore/schemas/`, so a non-default `--out` is for ad-hoc/CI
 * use — it will not drive the autocomplete of an already-scaffolded bundle.
 *
 * Validation lives here: the sole subcommand is `export` (anything else is a `usage` error, exit 2);
 * a repeated or value-less `--out`/`--type`, an unknown `--type`, or an `--out` that is absolute or
 * escapes the repo is a `usage` error; a non-writable output directory surfaces as a `denied` error
 * (exit 4) from the shared write seam. All file I/O is here ({@link ensureDir}/{@link writeFileNoFollow}/prune);
 * the byte computation stays pure in `core/schema.ts`.
 */

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { type CompiledType, loadProfile } from "../core/profile";
import {
  canonicalType,
  emitSchemaFiles,
  foldSchemaName,
  profileDigest,
  readGeneratorStamp,
  SCHEMAS_DIR,
} from "../core/schema";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, singleOptionValue } from "./args";
import { ensureDir, findSymlinkSegment, ioError, writeFileNoFollow } from "./fswrite";

/** Options for {@link runSchema}; `root` and the stream are injectable for tests. */
export interface SchemaOptions {
  /** The repo root whose `.lore/profile.toml` and output directory resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized positional + flag tokens from Commander. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for the kept-unattributable warning (non-`--json` only); defaults to `process.stderr`. */
  stderr?: Writer;
  /** The prune pass's directory IO; defaults to the real filesystem. A test seam (see {@link SchemaDirIO}). */
  schemaDirIO?: SchemaDirIO;
}

/**
 * The three filesystem operations the prune pass performs on the managed schema directory, injectable
 * so a test can model a filesystem where writing one name changes what another name reads — the
 * case-insensitive APFS/NTFS aliasing behind the LCLI-565 review finding — on any host, including
 * case-sensitive Linux CI.
 */
export interface SchemaDirIO {
  /** Entry names in `absDir`; throws `ENOENT` when it does not exist. */
  list(absDir: string): string[];
  /** A file's UTF-8 bytes. */
  read(absPath: string): string;
  /** Delete one file. */
  remove(absPath: string): void;
}

/** The real filesystem, {@link runSchema}'s default {@link SchemaDirIO}. */
const FS_SCHEMA_DIR_IO: SchemaDirIO = {
  list: (absDir) => readdirSync(absDir),
  read: (absPath) => readFileSync(absPath, "utf8"),
  remove: (absPath) => rmSync(absPath),
};

/** One `*.schema.json` entry in the managed directory as it stood BEFORE the export wrote anything. */
export interface SchemaDirEntry {
  /** The directory entry's own name, exactly as listed (case preserved). */
  readonly name: string;
  /** Its generator stamp at snapshot time, or `null` when it carried none. */
  readonly stamp: string | null;
}

/** Which pre-write entries a full export deletes, and which unattributable ones it keeps. */
export interface OrphanPrunePlan {
  /** Entry names to delete: orphans whose PRE-WRITE stamp is this binary's own digest. */
  readonly remove: readonly string[];
  /** Entry names kept because their pre-write stamp was absent or another profile's. */
  readonly kept: readonly string[];
}

/** The parsed form of `lore schema`'s arguments. */
interface SchemaArgs {
  /** The output directory (`--out`); `undefined` means the default {@link SCHEMAS_DIR}. */
  out?: string;
  /** The single type to export (`--type`), raw as the user spelled it; `undefined` means all types. */
  type?: string;
}

/** One written or pruned file, for the report. */
interface ReportFile {
  /** The repo-relative POSIX path (`<out>/<slug>.schema.json`). */
  readonly path: string;
}

/** The `schema.result` payload: where the schemas went, which were written, and which stale ones were pruned. */
export interface SchemaExportResult {
  /** The output directory, as given (or the default), for display. */
  readonly out: string;
  /** Every schema file written, in profile-declaration order. */
  readonly files: readonly ReportFile[];
  /**
   * Orphaned `<slug>.schema.json` files removed because no profile type owns them AND their generator
   * stamp matches this binary's profile digest, so the binary affirms they are its own (full export only).
   */
  readonly removed: readonly ReportFile[];
  /**
   * Orphaned `<slug>.schema.json` files KEPT because this binary cannot attribute them: their stamp
   * is from another profile, or absent (LCLI-565). Never deleted — a lore older than the tree would
   * otherwise delete a newer type's schema. `lore check` reports each as `schema-unattributable`.
   */
  readonly keptUnattributable: readonly ReportFile[];
  /** How many schema files were written (== `files.length`). */
  readonly count: number;
}

/**
 * Run `lore schema export`: parse the arguments, load the active profile, compute each type's schema
 * file via the shared pure emitter, write them under `--out` (overwriting), prune any orphaned schema
 * files on a full export, emit the `schema.result`, and return `0`. A bad subcommand/flag, repeated or
 * value-less flag, unknown `--type`, or repo-escaping `--out` throws a `usage` {@link LoreError} (exit
 * `2`); a non-writable output directory a `denied` one (exit `4`).
 */
export function runSchema(options: SchemaOptions): number {
  const parsed = parseSchemaArgs(options.args);
  const profile = loadProfile({ root: options.root });
  const outArg = parsed.out ?? SCHEMAS_DIR;
  const absOutDir = confineOutDir(outArg, options.root);

  let only: CompiledType | undefined;
  if (parsed.type !== undefined) {
    const canonical = canonicalType(parsed.type, profile);
    only = profile.types.get(canonical);
    if (only === undefined) {
      throw new LoreError(
        "usage",
        `no type "${parsed.type}" in the active profile`,
        `available types: ${[...profile.types.keys()].join(", ")}`,
        { type: parsed.type },
      );
    }
  }

  const files = emitSchemaFiles(profile, { dir: outArg, only });
  // A full export to the managed default directory owns its schema set, so a type dropped from the
  // profile leaves a stale schema behind; prune it there. A single-`--type` export is surgical and
  // never prunes its siblings, and a non-default `--out` is never lore-owned, so it is never pruned
  // either — see `isManagedSchemasDir`. The directory is SNAPSHOTTED here, before any write
  // (LCLI-565 review): on a case-insensitive filesystem an existing `ADR.schema.json` IS the
  // `adr.schema.json` the export is about to write, so judging an entry by its post-write bytes
  // would read this binary's own fresh stamp and delete the file just written.
  const io = options.schemaDirIO ?? FS_SCHEMA_DIR_IO;
  const managed = only === undefined && isManagedSchemasDir(absOutDir, options.root);
  const before = managed ? snapshotSchemaDir(absOutDir, outArg, io) : [];
  ensureDir(options.root, outArg);
  for (const file of files) {
    // `outArg` is confined to the repo, so `file.path` (`<outArg>/<slug>.schema.json`) is repo-relative
    // and `join(root, file.path)` is its absolute target — no need to re-derive the directory. Uses
    // `writeFileNoFollow`, not the plain `writeFileOverwriting`, because `emitSchemaFiles`'s output paths
    // are computed from the profile, not read from an existing file lore just walked — unlike
    // `writeFileOverwriting`'s other callers (`rename`/`supersede`), nothing upstream has ever confirmed
    // `file.path`'s leaf isn't a symlink. A leaf symlink at e.g. `.lore/schemas/story.schema.json`
    // pointing outside the repo would otherwise have a plain `writeFileSync` follow it and silently
    // overwrite whatever it points to (LORE-123); `writeFileNoFollow`'s up-front `lstatSync` refuses
    // that — and its temp-file-then-`renameSync` commit never dereferences a destination symlink
    // either, even one raced in after that check (LORE-130) — with the same `conflict` `LoreError`
    // the ancestor-symlink guard (LORE-93) already throws.
    writeFileNoFollow(join(options.root, file.path), file.contents, file.path);
  }
  const keep = new Set(files.map((file) => posix.basename(file.path)));
  const { removed, kept } = managed
    ? pruneOrphans(absOutDir, outArg, planOrphanPrune(before, keep, profileDigest(profile)), io)
    : { removed: [], kept: [] };

  const result: SchemaExportResult = {
    out: outArg,
    files: files.map((file) => ({ path: file.path })),
    removed,
    keptUnattributable: kept,
    count: files.length,
  };
  if (kept.length > 0 && options.output.mode !== "json") {
    const warnings = new WarningCollector();
    for (const file of kept) {
      warnings.add(
        `kept ${file.path}: no type in the active profile owns it and its generator stamp is not this lore's, so it was NOT pruned — read \`git log\` on it and on the profile, and delete it by hand only if the type was removed`,
      );
    }
    warnings.flush({ color: options.output.color, stderr: options.stderr });
  }
  emit(schemaRenderable(result), options.output, options.stdout);
  return EXIT_OK;
}

/**
 * The subset of `node:path` {@link confineOutDir} resolves through, injectable so its win32-specific
 * cross-drive check (see below, LORE-182) can be exercised with real Windows path semantics from a
 * unit test running on any host platform — production call sites never pass this and get the host's
 * own native functions (`HOST_PATH`) unconditionally.
 */
type PathOps = Pick<typeof import("node:path"), "resolve" | "relative" | "isAbsolute" | "sep">;

/** The host platform's real `node:path` primitives — {@link confineOutDir}'s production default. */
const HOST_PATH: PathOps = { resolve, relative, isAbsolute, sep };

/**
 * Resolve `--out` to an absolute directory, **confined to the repo** (mirroring `lore new`'s
 * `resolveOutPath`): an absolute path or one escaping the root via `..` is a `usage` error, because
 * the writes overwrite-truncate and a typo'd/hostile `--out ../../etc` would otherwise clobber files
 * anywhere on disk. The repo root itself (`--out .`) is allowed.
 *
 * Checks `isAbsolute(out)` on the **raw argument** (LORE-124): `node:path`'s `relative()` only ever
 * returns a relative-looking path (`""`, a `..`-prefixed climb, or a plain relative path) on POSIX, so
 * `isAbsolute(rel)` alone can never be true there — checking the raw argument closes the gap LORE-124
 * found, where an absolute `--out` resolving *inside* the repo slipped past silently. Callers
 * downstream (`runSchema`) still pass the caller's raw `outArg`, not this function's resolved `abs`,
 * into `emitSchemaFiles`/`ensureDir`/`join(root, file.path)`; if a same-inside absolute path were let
 * through, `path.join(root, absOutDir)` would blindly concatenate rather than collapse, double-prefixing
 * the root and creating a bogus directory instead of the real `.lore/schemas` (the unhandled ENOENT
 * `pruneOrphans` then hit). Rejecting every absolute `--out` up front — inside the repo or not — closes
 * that off at the source rather than trying to make every downstream `join` absolute-safe.
 *
 * `isAbsolute(rel)` is ALSO still checked, belt-and-suspenders (restored, LORE-182, after LORE-124
 * called it dead code and dropped it): dead on POSIX per the paragraph above, but very much alive on
 * win32 for a cross-drive **drive-relative** `--out` (Windows syntax like `"C:foo"` — relative to
 * drive C's current directory, distinct from the absolute `"C:\\foo"` form `isAbsolute(out)` already
 * catches). When the repo root is on a different drive (e.g. `"D:\\repo"`), neither `isAbsolute(out)`
 * nor a `".."`-climb check catches `"C:foo"` — but `win32.relative("D:\\repo", "C:\\foo")` returns the
 * target path unchanged (`"C:\\foo"`), which IS absolute, so `isAbsolute(rel)` catches what the other
 * two checks miss. Without this clause the confused input still can't escape (writes stay lexically
 * inside the repo and NTFS rejects the `:` in the eventual filename), so the blast radius is a
 * confusing IO error instead of a clean usage one — this restores the clean error.
 */
export function confineOutDir(out: string, root: string, path: PathOps = HOST_PATH): string {
  const abs = path.resolve(root, out);
  const rel = path.relative(root, abs);
  if (path.isAbsolute(out) || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw usage(`--out path "${out}" must be inside the repo`, "give a directory path relative to the repo root");
  }
  return abs;
}

/**
 * Whether `absOutDir` is the managed default schema directory (`.lore/schemas/`, resolved against
 * `root`) — the only directory lore itself owns the full contents of. Pruning is confined to this
 * directory (see {@link pruneOrphans}'s caller): any other `--out`, including the repo root itself
 * (`--out .`, which {@link confineOutDir} explicitly allows), may contain files lore didn't create and
 * must never be silently deleted.
 *
 * The lexical match alone is not enough: `resolve()` never dereferences symlinks, so a `.lore/schemas`
 * that is itself a symlink (or sits under a symlinked `.lore`) would still compare equal while actually
 * pointing somewhere lore doesn't own — {@link pruneOrphans} would then `rmSync` through it into
 * whatever real directory is on the other end. Reuses {@link findSymlinkSegment}'s existing
 * per-segment `lstatSync` walk (LORE-76/LORE-77's precedent guard, `commands/fswrite.ts`) rather than
 * a fresh check, so a symlinked default directory is treated as unmanaged — pruning is skipped, the
 * same as any other `--out` lore doesn't own.
 */
function isManagedSchemasDir(absOutDir: string, root: string): boolean {
  return absOutDir === resolve(root, SCHEMAS_DIR) && findSymlinkSegment(root, SCHEMAS_DIR) === null;
}

/**
 * Every `*.schema.json` entry in the managed directory and its generator stamp, read BEFORE the
 * export writes anything — the only bytes a prune decision may be taken on. A directory that does
 * not exist yet has no entries; any other read failure is a genuine IO fault, mapped via
 * {@link ioError}.
 */
function snapshotSchemaDir(absDir: string, displayDir: string, io: SchemaDirIO): SchemaDirEntry[] {
  let entries: string[];
  try {
    entries = io.list(absDir);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw ioError(cause, displayDir, "read directory");
  }
  return entries
    .filter((name) => name.endsWith(".schema.json"))
    .sort()
    .map((name) => {
      try {
        return { name, stamp: readGeneratorStamp(io.read(join(absDir, name))) };
      } catch (cause) {
        throw ioError(cause, posix.join(displayDir, name), "read file");
      }
    });
}

/**
 * The prune decision, pure (LCLI-565): given the managed directory's PRE-WRITE entries and their
 * stamps, the names the export writes (`keep`), and this binary's profile digest, which entries are
 * deleted and which unattributable ones are kept. Two rules, each sufficient alone against the
 * case-insensitive-filesystem bypass the review reproduced:
 *
 * - an entry whose name, case- and normalization-folded, matches a `keep` name is NEVER deleted
 *   and not reported: on a case-insensitive filesystem it is the file just written, and on a
 *   case-sensitive one deleting a file that differs from an owned one only by case is not a call
 *   this pass can make safely;
 * - every other entry is deleted only if its PRE-WRITE stamp equals `digest`; otherwise it is kept
 *   and reported, whether its stamp was absent or another profile's.
 */
export function planOrphanPrune(
  before: readonly SchemaDirEntry[],
  keep: ReadonlySet<string>,
  digest: string,
): OrphanPrunePlan {
  const owned = new Set([...keep].map(foldSchemaName));
  const remove: string[] = [];
  const kept: string[] = [];
  for (const entry of before) {
    if (keep.has(entry.name) || owned.has(foldSchemaName(entry.name))) {
      continue;
    }
    (entry.stamp === digest ? remove : kept).push(entry.name);
  }
  return { remove, kept };
}

/**
 * Carry out an {@link OrphanPrunePlan} against the managed directory (only ever called for it — see
 * {@link isManagedSchemasDir}), returning the report's `removed` and `kept` files. Deletes exactly
 * the planned names and nothing it re-reads or re-judges, so the decision stays the pre-write one.
 * This is the only schema delete in lore's source (LCLI-546 came through it).
 */
function pruneOrphans(
  absDir: string,
  displayDir: string,
  plan: OrphanPrunePlan,
  io: SchemaDirIO,
): { removed: ReportFile[]; kept: ReportFile[] } {
  const removed: ReportFile[] = [];
  for (const name of plan.remove) {
    const rel = posix.join(displayDir, name);
    try {
      io.remove(join(absDir, name));
    } catch (cause) {
      throw ioError(cause, rel, "remove file");
    }
    removed.push({ path: rel });
  }
  return { removed, kept: plan.kept.map((name) => ({ path: posix.join(displayDir, name) })) };
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `schema`'s tokens into the `export` subcommand and the value flags `--out <dir>` / `--type
 * <T>` (both also accept the `--flag=value` form). Commander has already resolved Lore's global
 * flags, so a `--`-prefixed token here is a command flag: an unrecognized one is a `usage` error, as
 * is a repeated or value-less flag, a missing/unknown subcommand, or a stray extra positional. A `--`
 * ends option parsing.
 */
function parseSchemaArgs(args: readonly string[]): SchemaArgs {
  const parsed = parseCommandArgs(args, "schema");
  const positionals = parsed.positionals;
  const out = singleOptionValue(parsed, "out");
  const type = singleOptionValue(parsed, "type");
  if (out === "") throw missingValue("--out");
  if (type === "") throw missingValue("--type");
  const sub = positionals[0];
  if (sub === undefined) {
    throw usage("`lore schema` needs a subcommand", "the only subcommand is `export`: run `lore schema export`");
  }
  if (sub !== "export") {
    throw usage(`unknown schema subcommand "${sub}"`, "the only subcommand is `export`: run `lore schema export`");
  }
  if (positionals.length > 1) {
    throw usage(`unexpected argument "${positionals[1]}"`, "run `lore schema export [--out <dir>] [--type <T>]`");
  }
  return { out, type };
}

/** The `usage` error a value-less value flag raises, with a flag-appropriate example. */
function missingValue(flag: string): LoreError {
  return usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} ${flag === "--out" ? "<dir>" : "<Type>"}\``);
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `schema export` (output.ts dispatches on the mode). */
function schemaRenderable(data: SchemaExportResult): Renderable<SchemaExportResult> {
  return { kind: "schema.result", data, pretty: render, plain: render };
}

/** One `wrote <path>` line per file, any `removed <path>` lines, then a summary. (No color: no severities.) */
function render(data: SchemaExportResult): string {
  const lines = data.files.map((file) => `wrote ${file.path}`);
  for (const file of data.removed) {
    lines.push(`removed ${file.path}`);
  }
  const noun = data.count === 1 ? "schema" : "schemas";
  const prunedNote = data.removed.length > 0 ? `, ${data.removed.length} stale removed` : "";
  lines.push(`${data.count} ${noun} exported to ${data.out}${prunedNote}`);
  return lines.join("\n");
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
