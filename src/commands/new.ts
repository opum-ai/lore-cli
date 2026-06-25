/**
 * commands/new.ts — `lore new <type> "<title>"`: scaffold a typed concept file.
 *
 * The thin command layer over the pure {@link buildNewConcept} (lore-design §2.2): it parses
 * the command's own arguments, resolves *which* template to render (a user template under
 * `.lore/templates/`, else the built-in for the type), computes the conventional output path,
 * asks core for the bytes, and writes them **never-clobbering** through the shared
 * {@link createIfAbsent}. All side effects (read the template, write the file) live here; all
 * byte computation lives in `core/template.ts`.
 *
 * The two load-bearing behaviors (LORE-18 ACs): a no-flag run renders from a built-in that
 * **validates clean by construction** (AC#1, guaranteed by the templates in core), and a
 * user template at `.lore/templates/<name>.md` **overrides** the built-in wholesale (AC#2).
 * Unlike `init`, an existing target is a `conflict` (exit `5`), not an idempotent skip: `new`
 * creates a *new* concept and must never overwrite or silently no-op onto an existing file.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { idFromPath } from "../core/concept";
import { DOCS_DIR } from "../core/scaffold";
import { canonicalType, typeDirectory } from "../core/schema";
import { buildNewConcept, builtinTemplateFor, slugify } from "../core/template";
import { EXIT_OK, errnoCode, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { createIfAbsent, ensureDir } from "./fswrite";

/** Where user templates live, relative to the repo root. */
const TEMPLATES_DIR = ".lore/templates";

/**
 * The stub `summary` injected when no `--summary` is given. Short and present, so a no-flag
 * run validates clean (a missing or over-long summary would warn), while clearly flagging
 * the one line the author should replace.
 */
const SUMMARY_STUB = "Add a one-line summary of this concept.";

/** The result of a `new` run: the created concept's id, path, and type. */
export interface NewResult {
  /** The new concept's bundle-relative id (path under `docs/` minus `.md`), e.g. `stories/bulk-archive`. */
  id: string;
  /** The repo-relative POSIX path written, e.g. `docs/stories/bulk-archive.md`. */
  path: string;
  /** The resolved concept `type` (canonical for a known type, verbatim for a producer extension). */
  type: string;
}

/** Options for {@link runNew}; `root`, `clock`, and the streams are injectable for tests. */
export interface NewOptions {
  /** The repo root to scaffold into. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `new`), as split by the router. */
  args: readonly string[];
  /** Clock seam for the `timestamp` token; defaults to the real wall clock. */
  clock?: () => Date;
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for advisory warnings; defaults to `process.stderr`. */
  stderr?: Writer;
}

/** The parsed form of `lore new`'s arguments. */
interface NewArgs {
  type: string;
  title: string;
  vars: Record<string, string>;
  template?: string;
  summary?: string;
  tags?: string;
  out?: string;
}

/**
 * Run `lore new`: parse the arguments, resolve the template, render the concept, and write it
 * never-clobbering. Returns the exit code (`0`). A missing positional or bad flag throws a
 * `usage` {@link LoreError} (exit `2`); an unfilled `{{placeholder}}` or invalid frontmatter a
 * `validation` error (exit `6`); an existing target a `conflict` (exit `5`).
 */
export function runNew(options: NewOptions): number {
  const clock = options.clock ?? (() => new Date());
  const parsed = parseNewArgs(options.args);
  const type = canonicalType(parsed.type);

  const docPath = resolveDocPath(parsed, type, options.root);
  const bodyTemplate = resolveTemplate(parsed, type, options.root);

  const build = buildNewConcept({
    docPath,
    type,
    title: parsed.title,
    summary: parsed.summary ?? SUMMARY_STUB,
    timestamp: clock().toISOString(),
    tags: parseTags(parsed.tags),
    bodyTemplate,
    vars: parsed.vars,
  });

  const absPath = join(options.root, docPath);
  ensureDir(join(options.root, posix.dirname(docPath)), posix.dirname(docPath));
  if (!createIfAbsent(absPath, build.contents, docPath)) {
    throw new LoreError(
      "conflict",
      `${docPath} already exists`,
      "choose a different title, pass --out <path>, or remove the existing file",
      { path: docPath },
    );
  }

  flushWarnings(build.warnings, options.output, options.stderr);
  emit(newRenderable({ id: bundleId(docPath), path: docPath, type: build.type }), options.output, options.stdout);
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `new`'s tokens into positionals (`<type> <title>`) and its flags. Global flags
 * (`--json`/`--plain`/…) are already stripped by the router, so anything `--`-prefixed here
 * is a command flag: an unrecognized one is a `usage` error, as is a value-taking flag with
 * no value, a malformed `--var`, or the wrong positional count. Both `--flag value` and
 * `--flag=value` forms are accepted.
 */
function parseNewArgs(args: readonly string[]): NewArgs {
  const positionals: string[] = [];
  const vars: Record<string, string> = Object.create(null);
  let template: string | undefined;
  let summary: string | undefined;
  let tags: string | undefined;
  let out: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg.startsWith("--") && arg.length > 2) {
      const eq = arg.indexOf("=");
      const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      // Consume the flag's value: the inline `=` form, else the next token (which must exist).
      const takeValue = (): string => {
        if (eq >= 0) {
          return arg.slice(eq + 1);
        }
        const next = args[i + 1];
        if (next === undefined) {
          throw usage(`option "--${name}" needs a value`, `pass a value, e.g. --${name} <value>`);
        }
        i++;
        return next;
      };
      switch (name) {
        case "var":
          addVar(vars, takeValue());
          break;
        case "template":
          template = takeValue();
          break;
        case "summary":
          summary = takeValue();
          break;
        case "tags":
          tags = takeValue();
          break;
        case "out":
          out = takeValue();
          break;
        default:
          throw usage(`unknown option "--${name}"`, "run `lore new --help` to list options");
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore new --help` to list options");
    } else {
      positionals.push(arg);
    }
  }

  const type = positionals[0];
  if (type === undefined || type.trim() === "") {
    throw usage("`lore new` needs a type", 'run `lore new <type> "<title>"`, e.g. lore new adr "Use soft deletes"');
  }
  const title = positionals[1];
  if (title === undefined || title.trim() === "") {
    throw usage("`lore new` needs a title", 'run `lore new <type> "<title>"` with a quoted title');
  }
  if (positionals.length > 2) {
    throw usage(
      `unexpected argument "${positionals[2]}"`,
      'pass exactly a type and a title; quote a multi-word title: lore new <type> "<title>"',
    );
  }
  return { type, title, vars, template, summary, tags, out };
}

/**
 * Record one `--var key=value` pair. The key must be a non-empty placeholder name
 * (`[A-Za-z0-9_.-]+`, the {@link renderTemplate} token grammar); the value is everything
 * after the first `=` (so it may itself contain `=`). `vars` is a null-prototype object, so a
 * key like `__proto__` lands as an own property without polluting any prototype.
 */
function addVar(vars: Record<string, string>, raw: string): void {
  const eq = raw.indexOf("=");
  if (eq <= 0) {
    throw usage(`--var must be key=value, got "${raw}"`, "supply a non-empty key, e.g. --var owner=payments");
  }
  const key = raw.slice(0, eq);
  if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
    throw usage(
      `--var key "${key}" is not a valid placeholder name`,
      "use letters, digits, dots, dashes, or underscores for the key",
    );
  }
  vars[key] = raw.slice(eq + 1);
}

/** Split a `--tags a,b,c` value into a trimmed, non-empty list (absent flag → `undefined`). */
function parseTags(tags: string | undefined): string[] | undefined {
  if (tags === undefined) {
    return undefined;
  }
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

// ── Path + template resolution ───────────────────────────────────────────────────

/**
 * Compute the new doc's repo-relative POSIX path. With `--out` the caller's path wins
 * (resolved and confined to the repo by {@link resolveOutPath}); otherwise it is the
 * conventional `docs/<typeDirectory>/<slug-of-title>.md`. A title with no slug-able content
 * and no `--out` is a `usage` error rather than a `-.md` file.
 */
function resolveDocPath(parsed: NewArgs, type: string, root: string): string {
  if (parsed.out !== undefined) {
    return resolveOutPath(parsed.out, root);
  }
  const slug = slugify(parsed.title);
  if (slug === "") {
    throw usage(`could not derive a filename from title "${parsed.title}"`, "pass an explicit path with --out <path>");
  }
  return posix.join(DOCS_DIR, typeDirectory(type), `${slug}.md`);
}

/**
 * Resolve a `--out` value to a repo-relative POSIX path, ensuring it stays **inside** the
 * repo (a `..`-escaping or absolute-outside path is a usage error, not a write outside the
 * bundle) and ends in `.md` (appended when the caller omitted it).
 */
function resolveOutPath(out: string, root: string): string {
  const rel = relative(root, resolve(root, out));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw usage(`--out path "${out}" must be inside the repo`, "give a path relative to the repo root");
  }
  const posixRel = rel.split(sep).join("/");
  return posixRel.endsWith(".md") ? posixRel : `${posixRel}.md`;
}

/**
 * Resolve the template text. The file base is `--template <name>` when given, else the
 * type; the file is `.lore/templates/<base>.md`, lower-cased to match the lower-cased schema
 * filenames and to be stable on case-insensitive filesystems. A present file is the user
 * template (override, AC#2). An absent file falls back to the built-in for the type — unless
 * `--template` named it explicitly, in which case its absence is a `not_found` error rather
 * than a silent fallback the caller did not ask for.
 */
function resolveTemplate(parsed: NewArgs, type: string, root: string): string {
  const base = (parsed.template ?? type).toLowerCase();
  const relPath = `${TEMPLATES_DIR}/${base}.md`;
  const text = readTemplateFile(join(root, relPath), relPath);
  if (text !== undefined) {
    return text;
  }
  if (parsed.template !== undefined) {
    throw new LoreError(
      "not_found",
      `template "${parsed.template}" not found at ${relPath}`,
      "create the template file, or omit --template to use the built-in",
      { path: relPath },
    );
  }
  return builtinTemplateFor(type);
}

/**
 * Read a template file as UTF-8, returning `undefined` when it does not exist (`ENOENT`) so
 * the caller can fall back to a built-in. A permission failure becomes a `denied`
 * {@link LoreError}; any other read fault propagates as an uncaught error.
 */
function readTemplateFile(absPath: string, relPath: string): string | undefined {
  try {
    return readFileSync(absPath, "utf8");
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "ENOENT") {
      return undefined;
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", `permission denied reading ${relPath}`, `make ${relPath} readable`, {
        path: relPath,
        code,
      });
    }
    throw cause;
  }
}

// ── Output ───────────────────────────────────────────────────────────────────────

/** The bundle-relative id for a written doc: the path under `docs/` minus `.md`. */
function bundleId(docPath: string): string {
  const prefix = `${DOCS_DIR}/`;
  return idFromPath(docPath.startsWith(prefix) ? docPath.slice(prefix.length) : docPath);
}

/** Flush advisory warnings to stderr in the shared `warning:` format (non-fatal; never changes the exit code). */
function flushWarnings(warnings: readonly string[], output: OutputContext, stderr: Writer | undefined): void {
  if (warnings.length === 0) {
    return;
  }
  const collector = new WarningCollector();
  for (const warning of warnings) {
    collector.add(warning);
  }
  collector.flush({ color: output.color, stderr });
}

/** The per-result-type rendering bundle for `new` (output.ts dispatches on the mode). */
function newRenderable(data: NewResult): Renderable<NewResult> {
  return { kind: "new", data, pretty: renderPretty, plain: renderPlain };
}

/** Human view: a one-line confirmation naming the type, id, and path. */
function renderPretty(data: NewResult): string {
  return `Created ${data.type} ${data.id}\n  ${data.path}`;
}

/** ANSI-free, diff-stable view: one `created <path>` line. */
function renderPlain(data: NewResult): string {
  return `created ${data.path}`;
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
