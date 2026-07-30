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

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { idFromPath } from "../core/concept";
import { loadProfile, type Profile, templateConfinementViolation } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { canonicalType, isKnownType, SCHEMAS_DIR, schemaFileName, schemaModeline, typeDirectory } from "../core/schema";
import { buildNewConcept, builtinTemplateFor, slugify } from "../core/template";
import { EXIT_OK, errnoCode, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { assertNotReservedStem, optionValues, parseCommandArgs } from "./args";
import { createIfAbsent, ensureDir, findSymlinkSegment } from "./fswrite";

/** Where user templates live, relative to the repo root. */
const TEMPLATES_DIR = ".lore/templates";

/** The reserved bundle-root index `lore init` owns (the sole `okf_version` carrier); `lore new` must not write it. */
const RESERVED_ROOT_INDEX = `${DOCS_DIR}/index.md`;

/** A valid concept type token: starts with a letter, then letters/digits/dashes/underscores — no spaces or path separators. */
const VALID_TYPE = /^[A-Za-z][A-Za-z0-9_-]*$/;

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
  /** The command's normalized positional + flag tokens from Commander. */
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
  const profile = loadProfile({ root: options.root });
  const type = canonicalType(parsed.type, profile);
  // A profile-declared type is valid by definition — including a multi-word/space-containing name
  // like "QA Plan" (its path segments come from the LOWER-KEBAB slug, which is always safe). The
  // VALID_TYPE shape check only gates an *ad-hoc* unknown type, whose raw token would otherwise
  // become a directory/filename segment verbatim.
  if (!isKnownType(type, profile) && !VALID_TYPE.test(type)) {
    throw usage(
      `"${parsed.type}" is not a valid type`,
      "a type must start with a letter and contain only letters, digits, dashes, or underscores — or be declared in .lore/profile.toml",
    );
  }

  const docPath = resolveDocPath(parsed, type, options.root);
  const bodyTemplate = resolveTemplate(parsed, type, options.root, profile);

  const build = buildNewConcept({
    docPath,
    type,
    title: parsed.title,
    summary: parsed.summary ?? SUMMARY_STUB,
    timestamp: clock().toISOString(),
    tags: parseTags(parsed.tags),
    bodyTemplate,
    vars: parsed.vars,
    modeline: resolveModeline(type, docPath, options.root, profile),
    profile,
  });

  const absPath = join(options.root, docPath);
  // Check for an existing target before creating any parent directories, so an aborted
  // (conflicting) run leaves no empty scaffold dirs behind. `createIfAbsent`'s atomic `wx`
  // write remains the authority that closes the time-of-check/time-of-use race.
  if (existsSync(absPath)) {
    throw conflict(docPath);
  }
  ensureDir(options.root, posix.dirname(docPath));
  if (!createIfAbsent(absPath, build.contents, docPath)) {
    throw conflict(docPath);
  }

  flushWarnings(build.warnings, options.output, options.stderr);
  emit(newRenderable({ id: bundleId(docPath), path: docPath, type: build.type }), options.output, options.stdout);
  return EXIT_OK;
}

/** A `conflict` {@link LoreError} (exit `5`) for a target path that already exists. */
function conflict(docPath: string): LoreError {
  return new LoreError(
    "conflict",
    `${docPath} already exists`,
    "choose a different title, pass --out <path>, or remove the existing file",
    { path: docPath },
  );
}

/**
 * The editor modeline for a known type whose exported schema actually exists on disk, else
 * `undefined`. An unknown type has no schema; a doc written into a never-`init`-ed bundle has no
 * `.lore/schemas/` either — in both cases lore writes no modeline rather than one pointing at a
 * `$schema` file that is not there.
 */
function resolveModeline(type: string, docPath: string, root: string, profile: Profile): string | undefined {
  if (!isKnownType(type, profile)) {
    return undefined;
  }
  if (!existsSync(join(root, SCHEMAS_DIR, schemaFileName(type)))) {
    return undefined;
  }
  return schemaModeline(docPath, type);
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `new`'s tokens into positionals (`<type> <title>`) and its flags. The router has
 * already stripped lore's global flags, so anything `--`-prefixed here is a command flag: an
 * unrecognized one is a `usage` error, as is a malformed `--var` or the wrong positional count.
 * Both `--flag value` and `--flag=value` forms are accepted; a value-taking flag refuses to
 * consume a following flag-looking token as its value (so `--summary --tags x` reports the
 * missing summary value rather than silently eating `--tags`). A `--` ends option parsing so a
 * title may begin with `-` (`lore new adr -- "-5 minute timeout"`).
 */
function parseNewArgs(args: readonly string[]): NewArgs {
  const parsed = parseCommandArgs(args, "new");
  const positionals = parsed.positionals;
  const vars: Record<string, string> = Object.create(null);
  for (const raw of optionValues(parsed, "var")) addVar(vars, raw);
  const template = optionValues(parsed, "template").at(-1);
  const summary = optionValues(parsed, "summary").at(-1);
  const tags = optionValues(parsed, "tags").at(-1);
  const out = optionValues(parsed, "out").at(-1);

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
  return { type: type.trim(), title: title.trim(), vars, template, summary, tags, out };
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
 *
 * The default path is checked against the same {@link assertNotReservedStem} guard
 * {@link resolveOutPath} applies (LORE-174): a title that slugifies to `index` or `log` (e.g.
 * `lore new reference "Index"`) would otherwise land on a stem `rename`/`supersede`/`link` treat
 * as lore-generated and refuse to touch, bypassing the policy LORE-114 added only on the `--out`
 * path. The default path always carries a non-empty type-directory segment (every known
 * {@link typeDirectory} maps to a non-empty string, and every ad-hoc type's slug is non-empty
 * since `VALID_TYPE` requires a leading letter), so it can never collide with the bundle-root
 * index `resolveOutPath` guards separately — no `RESERVED_ROOT_INDEX` check is needed here.
 */
function resolveDocPath(parsed: NewArgs, type: string, root: string): string {
  if (parsed.out !== undefined) {
    return resolveOutPath(parsed.out, root);
  }
  const slug = slugify(parsed.title);
  if (slug === "") {
    throw usage(`could not derive a filename from title "${parsed.title}"`, "pass an explicit path with --out <path>");
  }
  const docPath = posix.join(DOCS_DIR, typeDirectory(type), `${slug}.md`);
  assertNotReservedStem(idFromPath(docPath), "create");
  return docPath;
}

/**
 * Resolve a `--out` value to a repo-relative POSIX path, confining it to the **bundle root**
 * (`docs/`) and ending it in `.md` (appended when omitted). A path that escapes the repo
 * (`../…`, an absolute path elsewhere), lands outside `docs/`, or targets the reserved
 * bundle-root index (`docs/index.md`, owned by `lore init`) is a `usage` error — so `lore new`
 * can never write an orphaned file the bundle walk won't see, nor clobber the conformance root.
 * The `..` escape is matched by path **segment** (`..` exactly or a leading `../`), so a real
 * in-repo path whose first segment merely starts with `..` (e.g. `..notes/x`) is not rejected.
 *
 * Beyond the root index, ANY basename of `index`/`log` — at any nesting depth — is also rejected,
 * via the same {@link assertNotReservedStem} `rename`/`supersede`/`link` share (LORE-114): those
 * stems are lore's own generated file names wherever they sit, not just at the bundle root, so
 * `lore new` must not let a user create a doc that collides with one. Checked AFTER the
 * root-index-specific check above, so `docs/index.md` keeps its own message unaffected.
 */
function resolveOutPath(out: string, root: string): string {
  const rel = relative(root, resolve(root, out));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw usage(`--out path "${out}" must be inside the repo`, "give a path relative to the repo root");
  }
  let posixRel = rel.split(sep).join("/");
  if (!posixRel.endsWith(".md")) {
    posixRel = `${posixRel}.md`;
  }
  if (posixRel !== DOCS_DIR && !posixRel.startsWith(`${DOCS_DIR}/`)) {
    throw usage(
      `--out path "${out}" must be inside the bundle root (${DOCS_DIR}/)`,
      `give a path under ${DOCS_DIR}/, e.g. --out ${DOCS_DIR}/reference/orders.md`,
    );
  }
  if (posixRel === RESERVED_ROOT_INDEX) {
    throw usage(
      `${RESERVED_ROOT_INDEX} is the reserved bundle-root index`,
      "choose another path; `lore init` owns the root index that carries okf_version",
    );
  }
  assertNotReservedStem(idFromPath(posixRel), "create");
  return posixRel;
}

/**
 * Resolve the template text. The file base is `--template <name>` when given, else the type;
 * the file is `.lore/templates/<base>.md`. The base precedence is: an explicit `--template <name>`,
 * else the **profile type's declared `template`** (its filename minus `.md`), else the type name.
 * To be correct on **case-sensitive** filesystems (Linux/CI) while staying convenient on
 * case-insensitive ones, the lookup tries the name as given (e.g. `Reference.md`, matching the
 * docs' canonical-case `<type>` spelling) and then its lower-cased form (`reference.md`, matching
 * the schema filenames). A present file is the user template (override, AC#2). If none exists: an
 * explicit `--template` is a `not_found` error (the caller asked for a specific template); a
 * profile-declared-but-missing template, like the default, falls back to the built-in body.
 *
 * An explicit `--template` is a user-facing CLI flag (unlike `declared`, a repo-config value) and
 * is validated with {@link assertTemplateNameConfined} BEFORE it ever reaches a file path (LORE-69):
 * `--template` is documented as a bare name, never a path, so a `..` segment or an absolute value
 * is rejected outright rather than spliced into `${TEMPLATES_DIR}/${base}.md` and hoped safe. The
 * profile-declared `template` went through the analogous {@link templateConfinementViolation}
 * check already, at profile PARSE time (LORE-139), so it is not re-checked for confinement here —
 * only the two named-by-user-or-repo-config sources (`--template`, `declared`) get the symlink
 * refusal below; the bare-type-name convention lookup (neither given) does not (LORE-91 scope).
 */
function resolveTemplate(parsed: NewArgs, type: string, root: string, profile: Profile): string {
  const explicitTemplate = parsed.template !== undefined;
  if (parsed.template !== undefined) {
    assertTemplateNameConfined(parsed.template);
  }
  const declared = profile.types.get(type)?.template?.replace(/\.md$/i, "");
  const base = parsed.template ?? declared ?? type;
  // A named template source — the CLI flag or a profile's own declared filename — is refused if
  // it resolves through a symlink (LORE-91, widened to `declared` by LORE-185's AC#2); the bare
  // type-name convention lookup below carries no such refusal, matching the pre-LORE-185 scope.
  const checkSymlink = explicitTemplate || declared !== undefined;
  for (const candidate of templateCandidates(base)) {
    const relPath = `${TEMPLATES_DIR}/${candidate}.md`;
    const text = readTemplateFile(join(root, relPath), relPath, root, checkSymlink);
    if (text !== undefined) {
      return text;
    }
  }
  if (parsed.template !== undefined) {
    throw new LoreError(
      "not_found",
      `template "${parsed.template}" not found in ${TEMPLATES_DIR}/`,
      `create ${TEMPLATES_DIR}/${parsed.template}.md, or omit --template to use the built-in`,
      { path: `${TEMPLATES_DIR}/${parsed.template}.md` },
    );
  }
  return builtinTemplateFor(type);
}

/**
 * Reject a `--template` value that could escape `.lore/templates/` once spliced into a file
 * path, via the shared {@link templateConfinementViolation} predicate `core/profile.ts` also uses
 * for the profile-declared `[[types]].template` value (LORE-139) — LORE-185 consolidated what
 * used to be this function's own host-`resolve()`/`relative()` arithmetic (no backslash
 * normalization) onto that one pure-posix, backslash-aware implementation, closing a cross-host
 * drift: a Windows-style `--template ..\..\secret` escape was only ever caught on an actual win32
 * run before — a POSIX test/CI run saw it as one inert, non-escaping filename segment — and is now
 * rejected identically on every host. See {@link templateConfinementViolation}'s own docstring for
 * the absolute-path and `..`-escape rationale in full (both apply unchanged here).
 */
function assertTemplateNameConfined(name: string): void {
  const violation = templateConfinementViolation(name);
  if (violation === "absolute") {
    throw usage(
      `--template value "${name}" must not be an absolute path`,
      "pass a bare template name, e.g. --template adr",
    );
  }
  if (violation === "escape") {
    throw usage(
      `--template value "${name}" must not escape ${TEMPLATES_DIR}/`,
      "pass a bare template name, e.g. --template adr",
    );
  }
}

/** The template filenames to try for a base, the name as given first then its lower-cased form (deduped). */
function templateCandidates(base: string): string[] {
  const lower = base.toLowerCase();
  return base === lower ? [base] : [base, lower];
}

/**
 * Read a template file as UTF-8, returning `undefined` when it does not exist (`ENOENT`) so
 * the caller can fall back to a built-in. A permission failure becomes a `denied`
 * {@link LoreError}; any other read fault propagates as an uncaught error.
 *
 * `checkSymlink` (true for an explicit `--template` (LORE-91) AND, as of LORE-185's AC#2, a
 * profile-declared `template` — `resolveTemplate`'s `declared` fallback) refuses — rather than
 * silently reading through — a symlinked candidate anywhere in `relPath`'s segments, closing an
 * information-disclosure gap the purely syntactic {@link templateConfinementViolation} containment
 * check cannot: a bare, unsuspicious `--template evil` (or a profile declaring `template = "evil"`)
 * whose resolved `.lore/templates/evil.md` is itself a symlink to an arbitrary file outside the
 * repo would otherwise have that file's exact content silently embedded in the generated concept.
 * Mirrors this codebase's established write-path precedent (`fswrite.ts`'s
 * `assertNoSymlinkInPath`/`findSymlinkSegment`, LORE-76/77) rather than inventing a new pattern,
 * and its own READ-path precedent (`core/bundle.ts`'s `walkMarkdown`, `commands/replace.ts`) of
 * never following a symlink that could resolve outside the repo. `checkSymlink` is still `false`
 * for the bare-type-name convention lookup (neither `--template` nor a profile `declared` value) —
 * LORE-139 hardened that path's PARSE-time traversal check (via the profile's own compiled
 * `template`, confined before `resolveTemplate` ever sees it) but, unlike the two named sources
 * above, that implicit lookup names no untrusted value at all, so it was intentionally left out of
 * this task's AC#2 scope rather than "left untouched" wholesale, as an earlier draft of this
 * comment (pre-LORE-185) claimed.
 */
function readTemplateFile(absPath: string, relPath: string, root: string, checkSymlink: boolean): string | undefined {
  if (checkSymlink) {
    const symlink = findSymlinkSegment(root, relPath);
    if (symlink !== null) {
      throw new LoreError(
        "conflict",
        `refusing to read ${relPath}: "${symlink}" is a symlink, not a real directory or file`,
        "lore does not read through a symlink (it may resolve outside the repo) — remove or replace it, then re-run",
        { path: relPath, symlink },
      );
    }
  }
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
