/**
 * config.ts — the `.lore/config.toml` loader.
 *
 * lore keeps its team-chosen knobs in a committed `.lore/config.toml`: the
 * status-reconciliation policy, link/validate toggles, and (non-secret)
 * Confluence target settings ([ADR-0013](../docs/adr/0013-lore-state-directory.md)).
 * This module turns that file into one validated, typed {@link LoreConfig} the
 * rest of lore consumes. The design's `state.ts` (the broader `.lore/` + git
 * owner) imports `loadConfig` rather than re-parsing the file.
 *
 * Three properties define its behavior:
 *
 * - **Zero-config.** A missing `config.toml` is not an error — {@link loadConfig}
 *   returns the documented defaults. The file exists only to override them.
 * - **Secrets are environment-only.** The Confluence API token is read solely
 *   from `$LORE_CONFLUENCE_TOKEN`, never from the file and never written back. A
 *   `token` committed under `[confluence]` is a leak, so it fails loud
 *   (ADR-0013).
 * - **Deterministic + injectable.** The two impure inputs — the repo `root` and
 *   the `env` — are injectable seams (lore-design §8), so tests drive the loader
 *   without touching the real working directory or `process.env`.
 *
 * Bun parses TOML natively (`Bun.TOML.parse`), then Zod validates only the
 * generic parsed shape. Lore retains defaults/projection, committed-secret
 * scanning, reserved override-key policy, page-id precision, environment
 * overlay, and the stable {@link LoreError} mapping. Bad config is a
 * `"validation"` error (exit 6), keeping the diagnostic contract identical to
 * the rest of lore.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { errnoCode, LoreError } from "./errors";

/** Where lore's config lives, relative to the repo root. Exported so the `lore init` scaffolder writes to the exact path the loader reads. */
export const CONFIG_REL_PATH = ".lore/config.toml";

/** The single environment variable that may carry the Confluence API token. */
const TOKEN_ENV = "LORE_CONFLUENCE_TOKEN";

/** The status roll-up policies lore understands; only `"task-rollup"` exists in v1 (ADR-0013). */
const RECONCILE_MODES = ["task-rollup"] as const;

/** The Confluence wire formats the (deferred) publish adapter understands (ADR-0013). */
const CONFLUENCE_FORMATS = ["storage", "adf"] as const;

/** Generic parsed-TOML shape for `[reconcile]`; unknown future keys remain tolerated. */
const ReconcileTableSchema = z.looseObject({
  mode: z.enum(RECONCILE_MODES).optional(),
  overrides: z.record(z.string(), z.string()).optional(),
});

/** Generic parsed-TOML shape for `[validate]`; projection/default policy stays below. */
const ValidateTableSchema = z.looseObject({
  external_links: z.boolean().optional(),
  promote_portability: z.boolean().optional(),
});

/** Generic parsed-TOML shape for `[confluence]`; secret and page-id policy stay outside Zod. */
const ConfluenceTableSchema = z.looseObject({
  format: z.enum(CONFLUENCE_FORMATS).optional(),
  base_url: z.string().optional(),
  space: z.string().optional(),
  parent_page_id: z.union([z.string(), z.number()]).optional(),
});

/** Non-secret jira-cli settings. Credential storage and transport remain owned by jira-cli. */
const JiraTableSchema = z.looseObject({
  profile: z.string().optional(),
  project: z.string().optional(),
  board: z.string().optional(),
  issue_type: z.string().optional(),
  default_labels: z.array(z.string()).optional(),
  status_flow: z.array(z.string()).optional(),
});

/** Tracker table; backend selection itself lands with the init wiring in LCLI-315.3. */
const TrackerTableSchema = z.looseObject({
  jira: JiraTableSchema.optional(),
});

/**
 * The single declarative shape boundary for Bun's parsed TOML value. Loose
 * objects preserve Lore's additive unknown-key tolerance at every known table.
 */
const ParsedConfigSchema = z.looseObject({
  reconcile: ReconcileTableSchema.optional(),
  validate: ValidateTableSchema.optional(),
  confluence: ConfluenceTableSchema.optional(),
  tracker: TrackerTableSchema.optional(),
});

type ParsedConfig = z.infer<typeof ParsedConfigSchema>;
type ParsedConfluenceTable = z.infer<typeof ConfluenceTableSchema>;
type ParsedJiraTable = z.infer<typeof JiraTableSchema>;

/** The status roll-up policy applied by `lore sync` / `lore check`. */
export type ReconcileMode = (typeof RECONCILE_MODES)[number];

/** The Confluence storage format for the one-way publish adapter. */
export type ConfluenceFormat = (typeof CONFLUENCE_FORMATS)[number];

/** Status-reconciliation configuration (the `[reconcile]` table). */
export interface ReconcileConfig {
  /** The roll-up policy: all-tasks-Done → done, any In Progress → in-progress, else todo. */
  mode: ReconcileMode;
  /**
   * Per-repo status overrides: a Backlog status name → a rollup status string.
   * Values are carried through verbatim (validated only as strings here);
   * reconcile.ts (LORE-23) owns the rollup-status vocabulary and its semantics.
   */
  overrides: Readonly<Record<string, string>>;
}

/** Validation / coherence-gate configuration (the `[validate]` table). */
export interface ValidateConfig {
  /** Opt-in external-link liveness checking in `lore check` (default `false`; ADR-0007). */
  externalLinks: boolean;
  /** Promote the portability lint from warning to error in `lore check` (default `false`). */
  promotePortability: boolean;
}

/**
 * Confluence publish configuration (the `[confluence]` table). All fields are
 * non-secret; the API {@link ConfluenceConfig.token} is overlaid from the
 * environment and never read from the committed file.
 */
export interface ConfluenceConfig {
  /** Wiki base URL, e.g. `https://yourorg.atlassian.net/wiki`. */
  baseUrl?: string;
  /** Target space key, e.g. `ENG`. */
  space?: string;
  /** Parent page id the published tree hangs under. */
  parentPageId?: string;
  /** Wire format; defaults to `"storage"`. */
  format: ConfluenceFormat;
  /** API token — sourced ONLY from `$LORE_CONFLUENCE_TOKEN`, never the file. Absent when unset. */
  token?: string;
}

/** Non-secret Jira tracker settings. The installed jira-cli owns every credential. */
export interface JiraTrackerConfig {
  /** Optional jira-cli profile passed through as `jira --profile <name> ...`. */
  profile?: string;
  /** Jira project key, e.g. `JT`. */
  project?: string;
  /** Optional Jira Software board identifier retained for Jira-aware workflows. */
  board?: string;
  /** Jira issue type used by {@link import("./adapters/tracker").TrackerAdapter.createTask}. */
  issueType?: string;
  /** Labels added to every issue Lore creates. */
  defaultLabels: readonly string[];
  /** Ordered workflow used by reconciliation. */
  statusFlow: readonly string[];
}

/** Tracker-specific configuration; backend selection is added by LCLI-315.3. */
export interface TrackerConfig {
  jira?: JiraTrackerConfig;
}

/** The fully-resolved lore configuration: file values merged over defaults, with the env token overlaid. */
export interface LoreConfig {
  reconcile: ReconcileConfig;
  validate: ValidateConfig;
  confluence: ConfluenceConfig;
  /** Omitted in zero-config mode so existing Backlog-only projections remain byte-for-byte stable. */
  tracker?: TrackerConfig;
}

/** Options for {@link loadConfig}; both fields are injectable seams for determinism in tests. */
export interface LoadConfigOptions {
  /** Repo root containing `.lore/`; defaults to {@link process.cwd}. */
  root?: string;
  /** Environment source for the secret overlay; defaults to {@link process.env}. */
  env?: Record<string, string | undefined>;
}

/**
 * Load and validate `.lore/config.toml` under `root` (default cwd), overlaying
 * the Confluence token from `env` (default `process.env`). A missing file yields
 * the zero-config {@link defaultConfig}; malformed TOML or an out-of-contract
 * value throws a {@link LoreError} of type `"validation"`; a file that exists
 * but cannot be read (`EACCES`/`EPERM`) throws a `"denied"` {@link LoreError}
 * instead (see {@link readConfigText}).
 */
export function loadConfig(options: LoadConfigOptions = {}): LoreConfig {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const fromFile = parseConfigFile(join(root, CONFIG_REL_PATH));
  return overlayEnv(fromFile, env);
}

/** The zero-config defaults — what `loadConfig` returns when no `config.toml` exists. */
export function defaultConfig(): LoreConfig {
  return {
    reconcile: { mode: "task-rollup", overrides: {} },
    validate: { externalLinks: false, promotePortability: false },
    confluence: { format: "storage" },
  };
}

/** Read → parse → validate the file at `path`, or return defaults when it is absent. */
function parseConfigFile(path: string): LoreConfig {
  const raw = readConfigText(path);
  if (raw === undefined) {
    return defaultConfig();
  }
  return validateConfig(parseToml(raw));
}

/**
 * Read the config file as UTF-8. One read is the sole source of truth for
 * absent-vs-unreadable: `ENOENT` → `undefined` (the zero-config case — no
 * separate `existsSync`, so no time-of-check/time-of-use window); `EACCES`/`EPERM`
 * → a `denied` {@link LoreError} (the codebase-wide permissions contract — see
 * `errors.ts`'s `ioError`/`readFileIfPresent`); any other failure (a directory
 * at the path, …) is a `validation` error surfaced with its OS reason instead
 * of a blanket "check file permissions".
 */
function readConfigText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (cause) {
    if (isErrnoCode(cause, "ENOENT")) {
      return undefined;
    }
    if (isErrnoCode(cause, "EACCES") || isErrnoCode(cause, "EPERM")) {
      throw new LoreError(
        "denied",
        withReason(`${CONFIG_REL_PATH} could not be read`, cause),
        `check filesystem permissions on ${CONFIG_REL_PATH}`,
        // Attach the errno `code` (matching errors.ts's ioError/readFileIfPresent),
        // so a --json consumer reading envelope.input.code gets it here too.
        { path: CONFIG_REL_PATH, code: errnoCode(cause) },
      );
    }
    return fail(
      withReason(`${CONFIG_REL_PATH} could not be read`, cause),
      `ensure ${CONFIG_REL_PATH} is a readable file`,
      { path: CONFIG_REL_PATH },
    );
  }
}

/** Parse TOML via Bun's native parser, surfacing the parser's own message on failure. */
function parseToml(raw: string): Record<string, unknown> {
  // Strip leading UTF-8 BOM(s): Windows editors (Notepad, some PowerShell paths)
  // prepend U+FEFF — and some prepend more than one — which Bun.TOML.parse
  // otherwise swallows, parsing the file as an empty document `{}`: every
  // committed setting is silently dropped AND the committed-token guard (ADR-0013)
  // is bypassed. Strip every leading BOM, not just the first.
  let text = raw;
  while (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  try {
    return Bun.TOML.parse(text) as Record<string, unknown>;
  } catch (cause) {
    return fail(
      withReason(`${CONFIG_REL_PATH} is not valid TOML`, cause),
      `fix the TOML syntax in ${CONFIG_REL_PATH}`,
      { path: CONFIG_REL_PATH },
    );
  }
}

/** Project the parsed TOML table onto a {@link LoreConfig}, validating known keys and merging over defaults. */
function validateConfig(root: Record<string, unknown>): LoreConfig {
  const parsed = parseConfigShape(root);
  const defaults = defaultConfig();

  const reconcile: ReconcileConfig = {
    mode: parsed.reconcile?.mode ?? defaults.reconcile.mode,
    overrides: copyOverrideMap(parsed.reconcile?.overrides) ?? defaults.reconcile.overrides,
  };

  const validate: ValidateConfig = {
    externalLinks: parsed.validate?.external_links ?? defaults.validate.externalLinks,
    promotePortability: parsed.validate?.promote_portability ?? defaults.validate.promotePortability,
  };

  return {
    reconcile,
    validate,
    confluence: validateConfluence(parsed.confluence, defaults.confluence),
    ...(parsed.tracker === undefined
      ? {}
      : { tracker: { ...(parsed.tracker.jira === undefined ? {} : { jira: validateJira(parsed.tracker.jira) }) } }),
  };
}

/**
 * Validate the generic parsed-TOML shape once. Zod owns recognition; Lore owns
 * the stable public diagnostic contract through {@link failConfigShape}.
 */
function parseConfigShape(root: Record<string, unknown>): ParsedConfig {
  const result = ParsedConfigSchema.safeParse(root);
  if (result.success) {
    // Inspect the raw parsed map before Zod copies it: assigning `__proto__` to
    // a normal object can erase that entry, which must not bypass Lore's policy.
    assertNoReservedOverrideKey(root.reconcile, "reconcile.overrides");
    assertNoCommittedToken(root.confluence, "confluence");
    assertNoJiraCredentials(root.tracker, "tracker");
    return result.data;
  }

  // Preserve the hand-written validator's public failure precedence:
  // reconcile shape → reserved override policy → validate shape → committed
  // token policy → confluence shape. Zod recognizes every generic issue in one
  // pass; Lore chooses which established diagnostic to expose.
  const reconcileIssue = result.error.issues.find((issue) => issue.path[0] === "reconcile");
  if (reconcileIssue !== undefined) {
    if (reconcileIssue.path[1] === "overrides" && reconcileIssue.path.length >= 3) {
      assertNoReservedOverrideKey(root.reconcile, "reconcile.overrides", String(reconcileIssue.path[2]));
    }
    return failConfigShape(root, reconcileIssue);
  }
  assertNoReservedOverrideKey(root.reconcile, "reconcile.overrides");

  const validateIssue = result.error.issues.find((issue) => issue.path[0] === "validate");
  if (validateIssue !== undefined) {
    return failConfigShape(root, validateIssue);
  }

  // Scan whatever shape `confluence` takes — including an array on a
  // `[[confluence]]` typo — before exposing its generic table/type failure.
  assertNoCommittedToken(root.confluence, "confluence");
  const confluenceIssue = result.error.issues.find((issue) => issue.path[0] === "confluence");
  if (confluenceIssue !== undefined) {
    return failConfigShape(root, confluenceIssue);
  }

  // A credential-like key wins over a generic tracker shape error so it can
  // never hide inside an array-of-tables typo or a malformed nested table.
  assertNoJiraCredentials(root.tracker, "tracker");
  const trackerIssue = result.error.issues.find((issue) => issue.path[0] === "tracker");
  if (trackerIssue !== undefined) {
    return failConfigShape(root, trackerIssue);
  }

  if (result.error.issues.length === 0) {
    return fail(`${CONFIG_REL_PATH}: config has an invalid value`, `fix ${CONFIG_REL_PATH}`, { path: CONFIG_REL_PATH });
  }
  return failConfigShape(root, result.error.issues[0] as z.core.$ZodIssue);
}

/** Project the `[confluence]` table over defaults. The committed-token guard runs in {@link validateConfig}. */
function validateConfluence(table: ParsedConfluenceTable | undefined, defaults: ConfluenceConfig): ConfluenceConfig {
  const confluence: ConfluenceConfig = {
    format: table?.format ?? defaults.format,
  };
  const baseUrl = table?.base_url;
  if (baseUrl !== undefined) {
    confluence.baseUrl = baseUrl;
  }
  const space = table?.space;
  if (space !== undefined) {
    confluence.space = space;
  }
  const parentPageId = asPageId(table?.parent_page_id, "confluence.parent_page_id");
  if (parentPageId !== undefined) {
    confluence.parentPageId = parentPageId;
  }
  return confluence;
}

/** Project `[tracker.jira]` without ever consulting or carrying jira-cli credentials. */
function validateJira(table: ParsedJiraTable): JiraTrackerConfig {
  return {
    ...(table.profile === undefined ? {} : { profile: table.profile }),
    ...(table.project === undefined ? {} : { project: table.project }),
    ...(table.board === undefined ? {} : { board: table.board }),
    ...(table.issue_type === undefined ? {} : { issueType: table.issue_type }),
    defaultLabels: table.default_labels ?? [],
    statusFlow: table.status_flow ?? [],
  };
}

/**
 * Reject a committed Confluence token anywhere under `value` (ADR-0013),
 * recursing through tables and arrays of tables so a token at any depth — a
 * nested `[confluence.auth]` subtable or a `[[confluence]]` array-of-tables typo
 * — fails loud with a pointer to the env var, rather than slipping through or
 * surfacing a generic shape error. The token value is never echoed.
 */
function assertNoCommittedToken(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoCommittedToken(item, path);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const table = value as Record<string, unknown>;
  if ("token" in table) {
    fail(
      `${CONFIG_REL_PATH}: a Confluence token must not be committed`,
      `remove \`token\` from [${path}] and set $${TOKEN_ENV} instead`,
      { key: `${path}.token` },
    );
  }
  for (const [childKey, childValue] of Object.entries(table)) {
    assertNoCommittedToken(childValue, `${path}.${childKey}`);
  }
}

/**
 * Reject credential-like keys below `[tracker]`. Lore deliberately has no Jira
 * credential source: users configure the installed jira-cli with `jira init`.
 * Values are never echoed into the error envelope.
 */
function assertNoJiraCredentials(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoJiraCredentials(item, path);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const table = value as Record<string, unknown>;
  for (const key of ["token", "api_token", "jira_api_token", "email", "jira_email"] as const) {
    if (key in table) {
      fail(
        `${CONFIG_REL_PATH}: Jira credentials must not be committed or read by lore`,
        `remove \`${key}\` from [${path}] and run \`jira init\` to configure jira-cli instead`,
        { key: `${path}.${key}` },
      );
    }
  }
  for (const [childKey, childValue] of Object.entries(table)) {
    assertNoJiraCredentials(childValue, `${path}.${childKey}`);
  }
}

/**
 * Overlay the Confluence token from the environment. Only a value with
 * non-whitespace content counts: an unset, empty, or whitespace-only
 * `$LORE_CONFLUENCE_TOKEN` leaves the token absent so the (deferred) publish
 * adapter fails loud rather than sending a blank credential (ADR-0013). Stray
 * surrounding whitespace (a shell or CI secret can introduce it) is trimmed, and
 * the token is never written back to the file.
 */
function overlayEnv(config: LoreConfig, env: Record<string, string | undefined>): LoreConfig {
  const token = env[TOKEN_ENV]?.trim();
  if (!token) {
    return config;
  }
  return { ...config, confluence: { ...config.confluence, token } };
}

/** Throw a `"validation"` {@link LoreError}; typed `never` so callers can `return fail(...)`. */
function fail(message: string, hint: string, input: Record<string, unknown>): never {
  throw new LoreError("validation", message, hint, input);
}

/** True when `cause` is a Node fs error carrying the given errno `code` (e.g. `"ENOENT"`). */
function isErrnoCode(cause: unknown, code: string): boolean {
  return errnoCode(cause) === code;
}

/** Append `: <reason>` to `base` only when a non-empty reason can be derived from `cause`. */
function withReason(base: string, cause: unknown): string {
  const reason = describeCause(cause);
  return reason ? `${base}: ${reason}` : base;
}

/**
 * A single-line human reason from a thrown cause, for embedding in a diagnostic.
 * An aggregate parse error (Bun throws one for some malformed TOML) is flattened
 * to its sub-messages; otherwise the cause's own `message` is used.
 */
function describeCause(cause: unknown): string {
  const parts: string[] = [];
  if (cause !== null && typeof cause === "object" && Array.isArray((cause as { errors?: unknown }).errors)) {
    for (const sub of (cause as { errors: unknown[] }).errors) {
      pushIfNonEmpty(parts, causeMessage(sub));
    }
  }
  // Fall back to the top-level message when the aggregate yielded nothing usable
  // (an `errors` array whose sub-messages are all empty), so the diagnostic never
  // degrades to a bare base with no reason.
  if (parts.length === 0) {
    pushIfNonEmpty(parts, causeMessage(cause));
  }
  return parts
    .join("; ")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();
}

/** Push `message` onto `parts` only when it carries content. */
function pushIfNonEmpty(parts: string[], message: string): void {
  if (message !== "") {
    parts.push(message);
  }
}

/**
 * Best-effort human message from a thrown value. Prefers a string `message`
 * property over `String(value)` so a non-`Error` carrier (e.g. Bun's
 * `BuildMessage` TOML error) yields its reason — "Unexpected =" — rather than
 * leaking the runtime class-name prefix "BuildMessage: …".
 */
function causeMessage(cause: unknown): string {
  if (cause !== null && typeof cause === "object") {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return typeof cause === "string" ? cause : String(cause);
}

/**
 * Translate Zod's first deterministic shape issue into Lore's established
 * credential-safe config diagnostic. This is error-policy mapping, not a
 * second validator: recognition occurs only in {@link ParsedConfigSchema}.
 */
function failConfigShape(root: Record<string, unknown>, issue: z.core.$ZodIssue): never {
  const path = issue.path.map(String);
  const key = path.join(".");
  const value = configValueAtPath(root, issue.path);

  if (path.length === 1 || key === "reconcile.overrides" || key === "tracker.jira") {
    fail(`${CONFIG_REL_PATH}: ${key} must be a table`, `make ${key} a TOML table ([${key}] with key = value lines)`, {
      key,
    });
  }

  if (key === "validate.external_links" || key === "validate.promote_portability") {
    fail(`${CONFIG_REL_PATH}: ${key} must be a boolean`, `set ${key} to true or false`, { key, value });
  }

  if (
    key === "confluence.base_url" ||
    key === "confluence.space" ||
    key === "tracker.jira.profile" ||
    key === "tracker.jira.project" ||
    key === "tracker.jira.board" ||
    key === "tracker.jira.issue_type" ||
    (path[0] === "reconcile" && path[1] === "overrides")
  ) {
    fail(`${CONFIG_REL_PATH}: ${key} must be a string`, `quote ${key} as a string`, { key, value });
  }

  if (key.startsWith("tracker.jira.default_labels") || key.startsWith("tracker.jira.status_flow")) {
    fail(
      `${CONFIG_REL_PATH}: ${path.slice(0, 3).join(".")} must be an array of strings`,
      `set ${path.slice(0, 3).join(".")} to a TOML string array`,
      { key: path.slice(0, 3).join("."), value },
    );
  }

  if (key === "reconcile.mode") {
    fail(
      `${CONFIG_REL_PATH}: ${key} must be one of ${RECONCILE_MODES.map((allowed) => `"${allowed}"`).join(", ")}`,
      `set ${key} to one of: ${RECONCILE_MODES.join(", ")}`,
      { key, value },
    );
  }

  if (key === "confluence.format") {
    fail(
      `${CONFIG_REL_PATH}: ${key} must be one of ${CONFLUENCE_FORMATS.map((allowed) => `"${allowed}"`).join(", ")}`,
      `set ${key} to one of: ${CONFLUENCE_FORMATS.join(", ")}`,
      { key, value },
    );
  }

  if (key === "confluence.parent_page_id") {
    fail(
      `${CONFIG_REL_PATH}: ${key} must be a positive integer page id`,
      `set ${key} to a positive integer page id (a quoted string or an unquoted integer)`,
      { key, value },
    );
  }

  return fail(
    `${CONFIG_REL_PATH}: ${key || "config"} has an invalid value`,
    `fix ${key || CONFIG_REL_PATH}`,
    key ? { key, value } : { path: CONFIG_REL_PATH },
  );
}

/** Read a parsed value for structured error input without changing or coercing it. */
function configValueAtPath(root: Record<string, unknown>, path: PropertyKey[]): unknown {
  let value: unknown = root;
  for (const part of path) {
    if (value === null || typeof value !== "object") {
      return undefined;
    }
    value = (value as Record<PropertyKey, unknown>)[part];
  }
  return value;
}

/**
 * True for a key that cannot be stored on a plain object without being dropped or
 * shadowing an inherited member: every `Object.prototype` member (`__proto__`,
 * `constructor`, `toString`, `hasOwnProperty`, …) plus `prototype`. (TOML keys are
 * always strings, so this covers every key the loader can see.)
 */
function isUnsafeMapKey(key: string): boolean {
  return key === "prototype" || key in Object.prototype;
}

/**
 * Enforce Lore's reserved-key policy against the raw parsed table before Zod
 * copies it. Non-table shapes and non-string values are left to the generic
 * schema so their existing type diagnostics retain precedence.
 */
function assertNoReservedOverrideKey(reconcile: unknown, key: string, stopAtEntry?: string): void {
  if (reconcile === null || typeof reconcile !== "object" || Array.isArray(reconcile)) {
    return;
  }
  const value = (reconcile as Record<string, unknown>).overrides;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  for (const [entryKey, entryValue] of Object.entries(value)) {
    // The old validator checked entries in source order, validating each value
    // before its key policy. Stop where Zod found the first bad value so a
    // preceding reserved key still wins, while a later one cannot jump ahead.
    if (entryKey === stopAtEntry || typeof entryValue !== "string") {
      return;
    }
    if (!isUnsafeMapKey(entryKey)) {
      continue;
    }
    fail(
      `${CONFIG_REL_PATH}: ${key}.${entryKey} uses a reserved object key`,
      `rename the "${entryKey}" entry under [${key}] to a real status name`,
      { key: `${key}.${entryKey}`, value: entryValue },
    );
  }
}

/** Return Zod's validated string map on a normal plain object. */
function copyOverrideMap(value: Record<string, string> | undefined): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    out[entryKey] = entryValue;
  }
  return out;
}

/**
 * Accept a Confluence page id as a positive-integer string (any length, so an id
 * beyond `Number.MAX_SAFE_INTEGER` keeps full precision) or an unquoted positive
 * integer (its most natural form, e.g. `parent_page_id = 98765`). Both forms must
 * resolve to a positive integer — a `0`/negative, non-integer, empty, or
 * non-numeric id is rejected at load time rather than surfacing later as a publish
 * 404. The number form is constrained by its *value* (Bun has already normalized
 * `0x10`/`1_000`/`1e3` to a decimal integer), the string form by its literal text
 * (`/^[1-9][0-9]*$/`); the two are not byte-identical checks, but neither admits an
 * invalid id. The sign is checked before magnitude so a negative id reports "must
 * be positive", not "too large".
 */
function asPageId(value: unknown, key: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    if (!/^[1-9][0-9]*$/.test(value)) {
      fail(
        `${CONFIG_REL_PATH}: ${key} must be a positive integer page id`,
        `set ${key} to a positive integer page id, e.g. ${key} = "98765"`,
        { key, value },
      );
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      fail(
        `${CONFIG_REL_PATH}: ${key} must be a positive integer page id`,
        `set ${key} to a positive integer page id`,
        { key, value },
      );
    }
    if (!Number.isSafeInteger(value)) {
      fail(
        `${CONFIG_REL_PATH}: ${key} is too large to represent exactly as a number`,
        `quote ${key} as a string to preserve its precision`,
        { key, value },
      );
    }
    return String(value);
  }
  fail(
    `${CONFIG_REL_PATH}: ${key} must be a positive integer page id`,
    `set ${key} to a positive integer page id (a quoted string or an unquoted integer)`,
    { key, value },
  );
}
