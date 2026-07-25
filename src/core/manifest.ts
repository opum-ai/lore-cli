/**
 * core/manifest.ts — the machine-readable capability manifest `lore help --json`
 * serves (cli-surface §help; cli-contract §2/§7).
 *
 * A single, self-contained registry describing every **shipped** command — its
 * name, one-line summary, positional signature, flags, `--json` availability,
 * success envelope `kind`, the exit codes it can return, and runnable examples —
 * so an agent learns the whole CLI surface in one read instead of parsing prose.
 * Content is code-resident and root-independent (no bundle load, no config), so
 * the command layer needs no `root`.
 *
 * ## Exit codes are DERIVED from seams, not hand-listed
 *
 * `lore`'s exit codes are produced by a handful of shared "seam" helpers, and a
 * command inherits the full code set of every seam its `runX` call chain reaches
 * (verified against the real call chains — hand-listing per command drifted).
 * Each command therefore declares the seams it touches and its codes are computed
 * by {@link exitCodesFor} from one authoritative seam → code map ({@link SEAM_CODES}):
 *
 *   - `bundle`  (loadBundle)                    → 3 not_found, 4 denied, 6 validation
 *   - `read`    (readSource / path stat)        → 3 not_found, 4 denied
 *   - `profile` (loadProfile)                   → 6 validation (malformed profile)
 *   - `write`   (fswrite: ensureDir/create/…)   → 4 denied, 5 conflict
 *   - `backlog` (the Backlog adapter)           → 3 not_found, 6 validation/drift
 *   - `git`     (git log / commit seams)        → 6 drift
 *
 * plus `0` (success) and the universal `2` (usage, from the router's flag parsing)
 * on every command, and any command-specific `extra` code that is the command's own
 * logic rather than an I/O seam — a `not_found` for an unknown `instructions` topic,
 * or a gate/validation return (`validate`/`check`/`new`/`agents` all pass their
 * principal `6` as `extra` so it survives a seam refactor, not left to a coincidental
 * seam `6`). `1`
 * (uncaught) is a global-only condition (cli-contract §5.1) and is never listed
 * per command; the full taxonomy is in {@link Manifest.exitCodes}, sourced from
 * `errors.ts` so it cannot drift. `test/help.test.ts` pins each command's derived
 * `exitCodes` to a golden list transcribed from the call-chain trace, so a seam
 * mis-declaration fails CI.
 *
 * The name+summary pairs are kept byte-identical to `core/agent-bridge.ts`'s
 * `LORE_COMMANDS` (which the generated SKILL.md uses) — guarded by a test, not a
 * runtime import, so the two agent catalogs can't drift while the live CLI stays
 * decoupled from the SKILL generator. `--json` availability is universal, carried
 * per entry so a single entry is self-describing. Every entry is a real `cli.ts`
 * dispatch case (never an aspirational `scaffold`), pinned to the
 * router both directions by the lockstep test.
 */

import { EXIT_CODES, EXIT_OK, EXIT_UNCAUGHT } from "../errors";
import { SCHEMA_VERSION } from "../output";

/** One flag in the manifest: the bare name (no leading `--`), whether it takes a value, and a one-liner. */
export interface ManifestFlag {
  /** The flag name without the leading `--` (e.g. `dry-run`). */
  readonly name: string;
  /** A short alias without the leading `-` (e.g. `v` for `--version`), when the flag has one. */
  readonly alias?: string;
  /** Whether the flag consumes a following value (`--type <T>`) vs. a boolean switch (`--strict`). */
  readonly takesValue: boolean;
  /** Whether the flag may be repeated to accumulate values (`--tag a --tag b`). */
  readonly repeatable?: boolean;
  /** One-line description of what the flag does. */
  readonly summary: string;
}

/** One command in the manifest: everything an agent needs to invoke it correctly. */
export interface ManifestCommand {
  /** The subcommand token, exactly as `cli.ts` dispatches it. */
  readonly name: string;
  /** One-line description of what the command does (kept in sync with `LORE_COMMANDS`). */
  readonly summary: string;
  /** The positional-argument signature (e.g. `<id> <taskId…>`), or `""` when the command takes none. */
  readonly args: string;
  /** The command's own flags (global `--json`/`--plain` are in {@link Manifest.globalFlags}, not repeated here). */
  readonly flags: readonly ManifestFlag[];
  /** Whether the command supports the `--json` envelope. Universal today, carried per command so an entry is self-describing. */
  readonly json: boolean;
  /** The `kind` of the command's `--json` success envelope (cli-contract §2.1), matching the live `kind:` literal. */
  readonly kind: string;
  /** The exit codes this command can return, derived from its seams (see the module docstring); `1` (uncaught) is global-only. */
  readonly exitCodes: readonly number[];
  /** One or more runnable invocations. */
  readonly examples: readonly string[];
}

/** The whole capability manifest: the contract version, the global exit-code taxonomy, the global flags, and every command. */
export interface Manifest {
  /** The `--json` envelope/contract version (cli-contract §7); shared with every success envelope. */
  readonly schemaVersion: number;
  /** The semantic exit-code taxonomy: name → code, sourced from `errors.ts` so it cannot drift. */
  readonly exitCodes: Readonly<Record<string, number>>;
  /** The flags accepted in any position on every command (resolved by the router, not the command). */
  readonly globalFlags: readonly ManifestFlag[];
  /** Every shipped command, in `cli.ts` dispatch order. */
  readonly commands: readonly ManifestCommand[];
}

/** A shared error "seam" a command's call chain can reach; each maps to a fixed set of exit codes. */
type Seam = "bundle" | "read" | "profile" | "write" | "backlog" | "git";

/** The non-zero exit codes each seam can produce (verified against the real call chains; see the module docstring). */
const SEAM_CODES: Readonly<Record<Seam, readonly number[]>> = {
  bundle: [3, 4, 6], // loadBundle: not_found/denied (unreadable root), validation (malformed concept)
  read: [3, 4], // readSource / path stat: not_found, denied
  profile: [6], // loadProfile: validation (malformed .lore/profile.toml)
  write: [4, 5], // fswrite: denied (EACCES/EPERM), conflict (EEXIST/ENOTDIR/EISDIR)
  backlog: [3, 6], // Backlog adapter: not_found (binary/task missing), validation/drift
  git: [6], // git log / commit seams: drift
};

/**
 * Derive a command's sorted exit-code set from the seams it reaches: `0` (success)
 * and `2` (usage) are universal, each seam contributes {@link SEAM_CODES}, and
 * `extra` carries any command-specific code that reaches no filesystem seam.
 */
function exitCodesFor(seams: readonly Seam[], extra: readonly number[] = []): readonly number[] {
  const codes = new Set<number>([EXIT_OK, EXIT_CODES.usage, ...extra]);
  for (const seam of seams) {
    for (const code of SEAM_CODES[seam]) {
      codes.add(code);
    }
  }
  return [...codes].sort((a, b) => a - b);
}

/**
 * Recursively `Object.freeze`s an array/object graph — the container itself plus
 * every nested array/object it holds — so no level of the structure can be
 * mutated after construction (a mutation attempt throws in strict-mode JS/TS,
 * the module default, instead of silently corrupting the shared singleton).
 * Mirrors the codebase's own `Object.freeze` convention (YAML_LOAD_OPTIONS /
 * YAML_DUMP_OPTIONS in core/concept.ts, L124/L138) extended to nested structures,
 * since the manifest's `readonly` TS modifiers are compile-time-only and don't
 * stop an `as any`/plain-JS caller from mutating the singleton in place.
 */
function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value) as T;
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value) as T;
  }
  return value;
}

/** The four global flags the router resolves for every invocation (cli-contract §1). */
const GLOBAL_FLAGS: readonly ManifestFlag[] = deepFreeze([
  {
    name: "json",
    takesValue: false,
    summary: "Machine-readable JSON output (the {schemaVersion, kind, data} envelope)",
  },
  { name: "plain", takesValue: false, summary: "ANSI-free text output (auto-selected when stdout is piped)" },
  { name: "version", alias: "v", takesValue: false, summary: "Print the version and exit" },
  { name: "help", alias: "h", takesValue: false, summary: "Show help and exit" },
]);

/**
 * Every shipped command, in `cli.ts` dispatch order. Flags, `kind` values, and the
 * seam declarations behind `exitCodes` are transcribed from live source
 * (`commands/*.ts` call chains and `kind:` literals); summaries are kept identical
 * to `LORE_COMMANDS` (guarded by a test). The seam list passed to
 * {@link exitCodesFor} is the exit-code rationale — no hand-listed code needs a comment.
 */
const LORE_MANIFEST: readonly ManifestCommand[] = deepFreeze([
  {
    name: "init",
    summary: "Scaffold an OKF bundle; a bare TTY run also wizards the agent bridge/scaffolds/backlog check",
    args: "",
    flags: [
      { name: "yes", takesValue: false, summary: "Skip the interactive wizard even on a TTY; use flag defaults" },
      { name: "agents", takesValue: false, summary: "Also set up the Claude Code agent bridge (SKILL.md + CLAUDE.md)" },
      {
        name: "scaffold",
        takesValue: true,
        repeatable: true,
        summary: "Also scaffold a downstream doc consumer (mkdocs|docusaurus|obsidian)",
      },
      {
        name: "obsidian",
        takesValue: false,
        summary: "Also scaffold an Obsidian vault config (shorthand for --scaffold obsidian)",
      },
      {
        name: "check-backlog",
        takesValue: false,
        summary: "Check --json-capable backlog coupling even with no other flag",
      },
      { name: "no-backlog", takesValue: false, summary: "Skip the backlog-coupling capability check entirely" },
    ],
    json: true,
    kind: "init",
    // The backlog-coupling check is ADVISORY ONLY (LORE-260): a missing/incapable `backlog` becomes
    // a stderr warning plus a `backlog: {capable: false}` field, never a thrown error — so no
    // `backlog` seam code is added here despite `runInit` calling `adapter.probe()`.
    exitCodes: exitCodesFor(["profile", "write"]),
    examples: ["lore init", "lore init --agents --obsidian", "lore init --yes --scaffold mkdocs"],
  },
  {
    name: "new",
    summary: "Scaffold a typed concept from a template",
    args: '<type> "<title>"',
    flags: [
      { name: "var", takesValue: true, repeatable: true, summary: "Fill a `{{k}}` template placeholder (k=v)" },
      { name: "template", takesValue: true, summary: "Template name under .lore/templates/" },
      { name: "summary", takesValue: true, summary: "One-sentence concept summary" },
      { name: "tags", takesValue: true, summary: "Comma-separated frontmatter tags" },
      { name: "out", takesValue: true, summary: "Override the output path" },
    ],
    json: true,
    kind: "new",
    // extra 6 = an unfilled template placeholder / serialize-time validation (template.ts:263) —
    // new's own validation, modeled explicitly rather than left to the coincidental profile 6.
    exitCodes: exitCodesFor(["profile", "read", "write"], [6]),
    examples: [
      'lore new story "Bulk archive completed orders"',
      'lore new adr "Use soft deletes" --tags retention,orders',
    ],
  },
  {
    name: "validate",
    summary: "Check concept files against OKF + the lore profile (per-file)",
    args: "[paths…]",
    flags: [
      { name: "type", takesValue: true, summary: "Limit the report to one concept type" },
      { name: "strict", takesValue: false, summary: "Treat warnings as errors for the exit code" },
    ],
    json: true,
    kind: "validate.report",
    // extra 6 = the validation gate RETURN (validate.ts:81) — validate's principal failure, modeled
    // explicitly so it survives a profile-seam refactor; a malformed profile also throws 6.
    exitCodes: exitCodesFor(["profile", "read"], [6]),
    examples: ["lore validate", "lore validate --type ADR --strict"],
  },
  {
    name: "check",
    summary: "Validate links/anchors + reconciliation drift across the bundle (CI gate)",
    args: "[paths…]",
    flags: [
      { name: "strict", takesValue: false, summary: "Treat portability warnings as failures for the exit code" },
      { name: "external", takesValue: false, summary: "Also probe external-URL liveness (advisory; never gates)" },
    ],
    json: true,
    kind: "check.report",
    // extra 6 = the drift/link gate RETURN (check.ts:258) — check's principal failure, modeled
    // explicitly rather than left to the coincidental adapter 6.
    exitCodes: exitCodesFor(["read", "backlog"], [6]),
    examples: ["lore check", "lore check --external"],
  },
  {
    name: "replace",
    summary: "Find-and-replace across the bundle, skipping managed regions",
    args: '"<find>" "<replace>"',
    flags: [
      { name: "regex", takesValue: false, summary: "Treat <find> as a regular expression" },
      { name: "in", takesValue: true, repeatable: true, summary: "Scope to a glob (default: whole bundle)" },
      { name: "dry-run", takesValue: false, summary: "Report matches, write nothing" },
    ],
    json: true,
    kind: "replace.result",
    // No `bundle`/`profile` seam: replace rewrites raw bytes and never parses frontmatter, so no validation(6).
    exitCodes: exitCodesFor(["read", "write"]),
    examples: ['lore replace "soft delete" "soft-delete" --in "docs/stories/**"'],
  },
  {
    name: "rename",
    summary: "Move a concept and repoint every inbound link + ref",
    args: "<oldId> <newId>",
    flags: [{ name: "dry-run", takesValue: false, summary: "Report rewrites, move nothing" }],
    json: true,
    kind: "rename.result",
    exitCodes: exitCodesFor(["bundle", "write", "backlog"]),
    examples: ["lore rename stories/bulk-archive-orders stories/order-archival"],
  },
  {
    name: "supersede",
    summary: "Mark a concept superseded by another, wiring both ways",
    args: "<oldId> <newId>",
    flags: [
      { name: "rewrite-links", takesValue: false, summary: "Repoint inbound links to the successor" },
      { name: "dry-run", takesValue: false, summary: "Report the changes, write nothing" },
    ],
    json: true,
    kind: "supersede.result",
    exitCodes: exitCodesFor(["bundle", "profile", "write"]),
    examples: ["lore supersede adr/0007-old-decision adr/0012-new-decision --rewrite-links"],
  },
  {
    name: "link",
    summary: "Add task ids to a concept's tasks: + the doc: back-ref",
    args: "<id> <taskId…>",
    flags: [{ name: "no-back-ref", takesValue: false, summary: "Skip the doc: label write to the task" }],
    json: true,
    kind: "link.result",
    exitCodes: exitCodesFor(["bundle", "profile", "write", "backlog"]),
    examples: ["lore link stories/bulk-archive-orders task-42 task-57"],
  },
  {
    name: "unlink",
    summary: "Remove task ids from a concept's tasks: + the doc: back-ref",
    args: "<id> <taskId…>",
    flags: [
      { name: "no-back-ref", takesValue: false, summary: "Leave the doc: label on the task" },
      { name: "allow-missing", takesValue: false, summary: "Tolerate <id> not resolving to a live concept" },
    ],
    json: true,
    kind: "unlink.result",
    exitCodes: exitCodesFor(["bundle", "profile", "write", "backlog"]),
    examples: [
      "lore unlink stories/bulk-archive-orders task-42",
      "lore unlink stories/bulk-archive-orders task-42 --allow-missing",
    ],
  },
  {
    name: "sync",
    summary: "Reconcile status + managed task blocks, regen index/log, commit backlog/",
    args: "[paths…]",
    flags: [
      { name: "dry-run", takesValue: false, summary: "Report what would change, write nothing (docs/ or backlog/)" },
      { name: "no-index", takesValue: false, summary: "Skip index/log regeneration" },
    ],
    json: true,
    kind: "sync.result",
    exitCodes: exitCodesFor(["bundle", "profile", "read", "write", "backlog", "git"]),
    examples: ["lore sync", "lore sync --dry-run"],
  },
  {
    name: "tasks",
    summary: "Show the live status rollup for a concept's linked tasks",
    args: "<id>",
    flags: [{ name: "status", takesValue: true, summary: "Filter the rollup to one Backlog status" }],
    json: true,
    kind: "tasks.rollup",
    exitCodes: exitCodesFor(["bundle", "backlog"]),
    examples: [
      "lore tasks stories/bulk-archive-orders",
      'lore tasks stories/bulk-archive-orders --status "In Progress"',
    ],
  },
  {
    name: "orphans",
    summary: "Report tasks with no owning doc + docs whose linked task vanished",
    args: "",
    flags: [
      { name: "tasks-only", takesValue: false, summary: "Report only tasks with no owning doc" },
      { name: "docs-only", takesValue: false, summary: "Report only docs whose linked task vanished" },
      { name: "limit", takesValue: true, summary: "Cap each section's rows (default 20)" },
    ],
    json: true,
    kind: "orphans.report",
    // Same seams as `tasks`: bundle (loadBundle) + backlog (listTasks snapshot). A report, not a gate
    // (always exit 0 on success), so no `extra` gate-return code.
    exitCodes: exitCodesFor(["bundle", "backlog"]),
    examples: ["lore orphans", "lore orphans --tasks-only"],
  },
  {
    name: "schema",
    summary: "Export the profile's editor JSON Schemas to .lore/schemas/",
    args: "export",
    flags: [
      { name: "out", takesValue: true, summary: "Output directory (default .lore/schemas/)" },
      { name: "type", takesValue: true, summary: "Export one type's schema" },
    ],
    json: true,
    kind: "schema.result",
    // No read seam / no id lookup → no not_found(3).
    exitCodes: exitCodesFor(["profile", "write"]),
    examples: ["lore schema export"],
  },
  {
    name: "scaffold",
    summary: "Generate a downstream docs consumer's config, additively outside docs/",
    args: "<target>",
    flags: [{ name: "force", takesValue: false, summary: "Overwrite an existing generated config" }],
    json: true,
    kind: "scaffold.result",
    // An unknown/not-yet-implemented target is the universal usage(2); no command-specific extra.
    exitCodes: exitCodesFor(["profile", "write"]),
    examples: ["lore scaffold mkdocs", "lore scaffold mkdocs --force"],
  },
  {
    name: "graph",
    summary: "Emit the bundle's cross-link graph as json or dot",
    args: "[<id>]",
    flags: [
      { name: "dot", takesValue: false, summary: "Emit Graphviz DOT (mutually exclusive with --json)" },
      { name: "depth", takesValue: true, summary: "Bound the subgraph radius" },
    ],
    json: true,
    kind: "graph.export",
    exitCodes: exitCodesFor(["bundle"]),
    examples: ["lore graph", "lore graph stories/bulk-archive-orders --dot"],
  },
  {
    name: "query",
    summary: "Full-text search the bundle with frontmatter filters",
    args: '["<text>"]',
    flags: [
      { name: "type", takesValue: true, summary: "Filter by concept type" },
      { name: "tag", takesValue: true, repeatable: true, summary: "Filter by tag" },
      { name: "status", takesValue: true, summary: "Filter by status" },
      { name: "limit", takesValue: true, summary: "Cap the number of hits" },
      { name: "field", takesValue: true, repeatable: true, summary: "Arbitrary frontmatter filter (k=v)" },
    ],
    json: true,
    kind: "query.results",
    exitCodes: exitCodesFor(["bundle"]),
    examples: ['lore query "soft delete retention"', "lore query --type Story --tag orders --status in-progress"],
  },
  {
    name: "context",
    summary: "Assemble a concept + neighbor summaries within a token budget",
    args: "<id>",
    flags: [
      { name: "max-tokens", takesValue: true, summary: "Token budget (labeled chars/4 estimate)" },
      { name: "depth", takesValue: true, summary: "Neighbor radius (default 1)" },
    ],
    json: true,
    kind: "context.export",
    exitCodes: exitCodesFor(["bundle"]),
    examples: ["lore context stories/bulk-archive-orders --max-tokens 4000 --depth 2"],
  },
  {
    name: "instructions",
    summary: "Print task-scoped agent guidance on demand",
    args: "[<topic>]",
    flags: [],
    json: true,
    kind: "instructions.text",
    // Static registry, no filesystem seam; `extra` 3 is the unknown-topic not_found.
    exitCodes: exitCodesFor([], [3]),
    examples: ["lore instructions", "lore instructions linking"],
  },
  {
    name: "agents",
    summary: "Regenerate this bridge (SKILL.md + the CLAUDE.md nudge)",
    args: "",
    flags: [
      { name: "force", takesValue: false, summary: "Overwrite hand-edited generated files" },
      { name: "check", takesValue: false, summary: "Report drift without writing (CI gate for a stale bridge)" },
    ],
    json: true,
    kind: "agents.result",
    // Writes the bridge (fswrite); `extra` 6 is the managed-block validation throw and the --check drift return.
    exitCodes: exitCodesFor(["write"], [6]),
    examples: ["lore agents", "lore agents --check"],
  },
  {
    name: "help",
    summary: "Show help, or the machine-readable command manifest under --json",
    args: "[<command>]",
    flags: [],
    json: true,
    kind: "help.manifest",
    // Static registry, no filesystem seam; `extra` 3 is the unknown-command not_found.
    exitCodes: exitCodesFor([], [3]),
    examples: ["lore help", "lore help new", "lore help --json"],
  },
]);

/**
 * The semantic exit-code taxonomy, name → code, built from the `errors.ts`
 * constants so it can never drift from the real mapping (`validation` and `drift`
 * intentionally share `6`; cli-contract §5.1/§5.3).
 */
export function exitCodeTaxonomy(): Record<string, number> {
  return { ok: EXIT_OK, uncaught: EXIT_UNCAUGHT, ...EXIT_CODES };
}

/**
 * Build the full {@link Manifest} for `lore help --json`. The returned envelope is
 * deeply frozen (AC#1): `globalFlags`/`commands` are the already-frozen module
 * singletons ({@link GLOBAL_FLAGS}/{@link LORE_MANIFEST}), `exitCodes` is a fresh
 * object frozen here, and the envelope itself is frozen last — so no caller,
 * however it bypasses the compile-time `readonly` modifiers, can mutate a manifest
 * returned by this function or poison a later call's read.
 */
export function buildManifest(): Manifest {
  return deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    exitCodes: exitCodeTaxonomy(),
    globalFlags: GLOBAL_FLAGS,
    commands: LORE_MANIFEST,
  });
}

/** Look up one command by its exact dispatch name (case-sensitive), or `undefined` if unknown. */
export function findManifestCommand(name: string): ManifestCommand | undefined {
  return LORE_MANIFEST.find((command) => command.name === name);
}

/** Every command name the manifest advertises, in dispatch order — the set the lockstep test pins against the router. */
export function manifestCommandNames(): readonly string[] {
  return LORE_MANIFEST.map((command) => command.name);
}
