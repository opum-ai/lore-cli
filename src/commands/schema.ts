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
 * otherwise keep driving editor validation from a removed type's rules). Pruning never runs against a
 * non-default `--out`: that directory isn't lore-owned, so a pre-existing `*.schema.json` sitting
 * there — including one placed by an unrelated tool — must never be silently deleted. A single-`--type`
 * export touches only that one file and prunes nothing.
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

import { readdirSync, rmSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { type CompiledType, loadProfile } from "../core/profile";
import { canonicalType, emitSchemaFiles, SCHEMAS_DIR, type SchemaFile } from "../core/schema";
import { EXIT_OK, LoreError, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { ensureDir, findSymlinkSegment, ioError, writeFileNoFollow } from "./fswrite";

/** Options for {@link runSchema}; `root` and the stream are injectable for tests. */
export interface SchemaOptions {
  /** The repo root whose `.lore/profile.toml` and output directory resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `schema`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
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
  /** Orphaned `<slug>.schema.json` files removed because no profile type owns them (full export only). */
  readonly removed: readonly ReportFile[];
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
  ensureDir(options.root, outArg);
  for (const file of files) {
    // `outArg` is confined to the repo, so `file.path` (`<outArg>/<slug>.schema.json`) is repo-relative
    // and `join(root, file.path)` is its absolute target — no need to re-derive the directory. Uses
    // `writeFileNoFollow`, not the plain `writeFileOverwriting`, because `emitSchemaFiles`'s output paths
    // are computed from the profile, not read from an existing file lore just walked — unlike
    // `writeFileOverwriting`'s other callers (`rename`/`supersede`), nothing upstream has ever confirmed
    // `file.path`'s leaf isn't a symlink. A leaf symlink at e.g. `.lore/schemas/story.schema.json`
    // pointing outside the repo would otherwise have a plain `writeFileSync` follow it and silently
    // overwrite whatever it points to (LORE-123); `writeFileNoFollow`'s `O_NOFOLLOW` open refuses that
    // with the same `conflict` `LoreError` the ancestor-symlink guard (LORE-93) already throws.
    writeFileNoFollow(join(options.root, file.path), file.contents, file.path);
  }
  // A full export to the managed default directory owns its schema set, so a type dropped from the
  // profile leaves a stale schema behind; prune it there. A single-`--type` export is surgical and
  // never prunes its siblings, and a non-default `--out` is never lore-owned, so it is never pruned
  // either — see `isManagedSchemasDir`.
  const removed =
    only === undefined && isManagedSchemasDir(absOutDir, options.root) ? pruneOrphans(absOutDir, outArg, files) : [];

  const result: SchemaExportResult = {
    out: outArg,
    files: files.map((file) => ({ path: file.path })),
    removed,
    count: files.length,
  };
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
 * Delete every `<name>.schema.json` in `absDir` that the just-written `files` set does not contain —
 * the orphans a removed/renamed profile type left behind — and return them for the report. Only
 * `*.schema.json` is touched, and only ever called for the managed default directory (see
 * {@link isManagedSchemasDir}), so every file this walks is lore-owned; other files are never removed.
 * The directory was just `ensureDir`'d, so a read failure here is a genuine IO fault, mapped via the
 * shared {@link ioError}.
 */
function pruneOrphans(absDir: string, displayDir: string, files: readonly SchemaFile[]): ReportFile[] {
  const keep = new Set(files.map((file) => posix.basename(file.path)));
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch (cause) {
    throw ioError(cause, displayDir, "read directory");
  }
  const removed: ReportFile[] = [];
  for (const entry of entries.sort()) {
    if (entry.endsWith(".schema.json") && !keep.has(entry)) {
      const rel = posix.join(displayDir, entry);
      try {
        rmSync(join(absDir, entry));
      } catch (cause) {
        throw ioError(cause, rel, "remove file");
      }
      removed.push({ path: rel });
    }
  }
  return removed;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `schema`'s tokens into the `export` subcommand and the value flags `--out <dir>` / `--type
 * <T>` (both also accept the `--flag=value` form). The router has already stripped lore's global
 * flags, so a `--`-prefixed token here is a command flag: an unrecognized one is a `usage` error, as
 * is a repeated or value-less flag, a missing/unknown subcommand, or a stray extra positional. A `--`
 * ends option parsing.
 */
function parseSchemaArgs(args: readonly string[]): SchemaArgs {
  const positionals: string[] = [];
  let out: string | undefined;
  let type: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      const inline = eq === -1 ? undefined : body.slice(eq + 1);
      if (name === "out") {
        if (out !== undefined) {
          throw usage("--out given more than once", "pass --out at most once");
        }
        out = readValue("--out", inline, args, i);
        if (inline === undefined) {
          i++;
        }
      } else if (name === "type") {
        if (type !== undefined) {
          throw usage("--type given more than once", "pass --type at most once");
        }
        type = readValue("--type", inline, args, i);
        if (inline === undefined) {
          i++;
        }
      } else {
        throw usage(`unknown option "--${name}"`, "run `lore schema --help` to list options");
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore schema --help` to list options");
    } else {
      positionals.push(arg);
    }
  }

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

/**
 * Read a value flag's argument: its inline `--flag=value` form when present, else the **next** token.
 * A missing/empty value — or a next token that is itself an option (`--out --type`, `--out --`) — is a
 * `usage` error rather than a silently swallowed flag (mirroring `lore new`'s value-flag guard), so a
 * fat-fingered `--out --type=Story` fails loudly instead of exporting the wrong files to a garbage dir.
 */
function readValue(flag: string, inline: string | undefined, args: readonly string[], i: number): string {
  if (inline !== undefined) {
    if (inline === "") {
      throw missingValue(flag);
    }
    return inline;
  }
  const next = args[i + 1];
  if (next === undefined || next === "" || (next.startsWith("-") && next !== "-")) {
    throw missingValue(flag);
  }
  return next;
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
