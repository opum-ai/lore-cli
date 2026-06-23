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
 * Config parsing adds **no dependency**: Bun parses TOML natively
 * (`Bun.TOML.parse`), and shape/enum validation is hand-rolled here (Zod is the
 * frontmatter source of truth, introduced later with LORE-15). Bad config is a
 * {@link LoreError} of type `"validation"` (exit 6), keeping the diagnostic
 * contract identical to the rest of lore.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LoreError } from "./errors";

/** Where lore's config lives, relative to the repo root. */
const CONFIG_REL_PATH = ".lore/config.toml";

/** The single environment variable that may carry the Confluence API token. */
const TOKEN_ENV = "LORE_CONFLUENCE_TOKEN";

/** The status roll-up policies lore understands; only `"task-rollup"` exists in v1 (ADR-0013). */
const RECONCILE_MODES = ["task-rollup"] as const;

/** The Confluence wire formats the (deferred) publish adapter understands (ADR-0013). */
const CONFLUENCE_FORMATS = ["storage", "adf"] as const;

/** The status roll-up policy applied by `lore sync` / `lore check`. */
export type ReconcileMode = (typeof RECONCILE_MODES)[number];

/** The Confluence storage format for the one-way publish adapter. */
export type ConfluenceFormat = (typeof CONFLUENCE_FORMATS)[number];

/** Status-reconciliation configuration (the `[reconcile]` table). */
export interface ReconcileConfig {
  /** The roll-up policy: all-tasks-Done → done, any In Progress → in-progress, else todo. */
  mode: ReconcileMode;
  /** Per-repo status-name overrides (a Backlog status string → the lore status to roll it up as). */
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

/** The fully-resolved lore configuration: file values merged over defaults, with the env token overlaid. */
export interface LoreConfig {
  reconcile: ReconcileConfig;
  validate: ValidateConfig;
  confluence: ConfluenceConfig;
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
 * value throws a {@link LoreError} of type `"validation"`.
 */
export function loadConfig(options: LoadConfigOptions = {}): LoreConfig {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const fromFile = parseConfigFile(join(root, CONFIG_REL_PATH));
  return overlayEnv(fromFile, env);
}

/** The zero-config defaults — what `loadConfig` returns when no `config.toml` exists. */
function defaultConfig(): LoreConfig {
  return {
    reconcile: { mode: "task-rollup", overrides: {} },
    validate: { externalLinks: false, promotePortability: false },
    confluence: { format: "storage" },
  };
}

/** Read → parse → validate the file at `path`, or return defaults when it is absent. */
function parseConfigFile(path: string): LoreConfig {
  if (!existsSync(path)) {
    return defaultConfig();
  }
  return validateConfig(parseToml(readConfigText(path)));
}

/** Read the config file as UTF-8, mapping an unreadable-but-present file to a validation error. */
function readConfigText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fail(`${CONFIG_REL_PATH} could not be read`, `check file permissions on ${CONFIG_REL_PATH}`, {
      path: CONFIG_REL_PATH,
    });
  }
}

/** Parse TOML via Bun's native parser, mapping a syntax error to a validation error. */
function parseToml(raw: string): unknown {
  try {
    return Bun.TOML.parse(raw);
  } catch {
    return fail(`${CONFIG_REL_PATH} is not valid TOML`, `fix the TOML syntax in ${CONFIG_REL_PATH}`, {
      path: CONFIG_REL_PATH,
    });
  }
}

/** Project the parsed TOML onto a {@link LoreConfig}, validating known keys and merging over defaults. */
function validateConfig(parsed: unknown): LoreConfig {
  const root = asTable(parsed, "<root>");
  if (root === undefined) {
    return fail(`${CONFIG_REL_PATH} must be a TOML table`, `see the ${CONFIG_REL_PATH} format in ADR-0013`, {
      path: CONFIG_REL_PATH,
    });
  }
  const defaults = defaultConfig();

  const reconcileTable = asTable(root.reconcile, "reconcile");
  const reconcile: ReconcileConfig = {
    mode: asEnum(reconcileTable?.mode, "reconcile.mode", RECONCILE_MODES) ?? defaults.reconcile.mode,
    overrides: asStringMap(reconcileTable?.overrides, "reconcile.overrides") ?? defaults.reconcile.overrides,
  };

  const validateTable = asTable(root.validate, "validate");
  const validate: ValidateConfig = {
    externalLinks:
      asBoolean(validateTable?.external_links, "validate.external_links") ?? defaults.validate.externalLinks,
    promotePortability:
      asBoolean(validateTable?.promote_portability, "validate.promote_portability") ??
      defaults.validate.promotePortability,
  };

  return { reconcile, validate, confluence: validateConfluence(asTable(root.confluence, "confluence")) };
}

/** Project the `[confluence]` table, rejecting a committed token (ADR-0013: secrets never enter the repo). */
function validateConfluence(table: Record<string, unknown> | undefined): ConfluenceConfig {
  if (table && "token" in table) {
    fail(
      `${CONFIG_REL_PATH}: a Confluence token must not be committed`,
      `remove \`token\` from [confluence] and set $${TOKEN_ENV} instead`,
      { key: "confluence.token" },
    );
  }
  const confluence: ConfluenceConfig = {
    format: asEnum(table?.format, "confluence.format", CONFLUENCE_FORMATS) ?? "storage",
  };
  const baseUrl = asString(table?.base_url, "confluence.base_url");
  if (baseUrl !== undefined) {
    confluence.baseUrl = baseUrl;
  }
  const space = asString(table?.space, "confluence.space");
  if (space !== undefined) {
    confluence.space = space;
  }
  const parentPageId = asString(table?.parent_page_id, "confluence.parent_page_id");
  if (parentPageId !== undefined) {
    confluence.parentPageId = parentPageId;
  }
  return confluence;
}

/**
 * Overlay the Confluence token from the environment. Only a non-empty value
 * counts: an unset or blank `$LORE_CONFLUENCE_TOKEN` leaves the token absent so
 * the (deferred) publish adapter fails loud rather than sending an empty
 * credential (ADR-0013). The token is never written back to the file.
 */
function overlayEnv(config: LoreConfig, env: Record<string, string | undefined>): LoreConfig {
  const token = env[TOKEN_ENV];
  if (token === undefined || token === "") {
    return config;
  }
  return { ...config, confluence: { ...config.confluence, token } };
}

/** Throw a `"validation"` {@link LoreError}; typed `never` so callers can `return fail(...)`. */
function fail(message: string, hint: string, input: Record<string, unknown>): never {
  throw new LoreError("validation", message, hint, input);
}

/** Require a TOML table (plain object) when present; `undefined` passes through for "absent". */
function asTable(value: unknown, name: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(
      `${CONFIG_REL_PATH}: ${name} must be a table`,
      `make ${name} a TOML table ([${name}] with key = value lines)`,
      {
        key: name,
      },
    );
  }
  return value as Record<string, unknown>;
}

/** Require a boolean when present. */
function asBoolean(value: unknown, key: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    fail(`${CONFIG_REL_PATH}: ${key} must be a boolean`, `set ${key} to true or false`, { key, value });
  }
  return value;
}

/** Require a string when present. */
function asString(value: unknown, key: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    fail(`${CONFIG_REL_PATH}: ${key} must be a string`, `quote ${key} as a string`, { key, value });
  }
  return value;
}

/** Require one of `allowed` when present. */
function asEnum<T extends string>(value: unknown, key: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(
      `${CONFIG_REL_PATH}: ${key} must be one of ${allowed.map((a) => `"${a}"`).join(", ")}`,
      `set ${key} to one of: ${allowed.join(", ")}`,
      { key, value },
    );
  }
  return value as T;
}

/** Require a table whose every value is a string when present (e.g. `[reconcile.overrides]`). */
function asStringMap(value: unknown, key: string): Record<string, string> | undefined {
  const table = asTable(value, key);
  if (table === undefined) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(table)) {
    if (typeof entryValue !== "string") {
      fail(`${CONFIG_REL_PATH}: ${key}.${entryKey} must be a string`, `quote ${key}.${entryKey} as a string`, {
        key: `${key}.${entryKey}`,
        value: entryValue,
      });
    }
    out[entryKey] = entryValue;
  }
  return out;
}
