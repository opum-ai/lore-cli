/**
 * core/manifest.ts — the machine-readable capability manifest `lore help --json`
 * serves (cli-surface §help; cli-contract §2/§7).
 *
 * A single registry describing every **shipped** command — its name, one-line
 * summary, positional signature, flags, `--json` availability, success envelope
 * `kind`, the exit codes it can return, and runnable examples — so an agent learns
 * the whole CLI surface in one read instead of parsing prose. It is the same
 * static-registry shape as `core/instructions.ts`'s `INSTRUCTION_TOPICS`: content
 * is code-resident and root-independent (no bundle load, no config), so the
 * command layer needs no `root`.
 *
 * Each command's `name` + `summary` are taken **from** `core/agent-bridge.ts`'s
 * `LORE_COMMANDS` (the list the generated SKILL.md already curates), and this
 * module layers on the richer per-command detail. Sharing one source for the
 * name/summary pair means the two agent-facing catalogs (SKILL.md and `lore help`)
 * cannot drift.
 *
 * Two invariants keep this an honest, additive-only contract (LORE-38 AC#2):
 *
 *  1. **Only shipped commands.** Every entry is a real `cli.ts` dispatch case —
 *     never an aspirational command (`tasks`/`orphans`/`scaffold` are documented
 *     in cli-surface.md but not shipped; they are absent here). The lockstep test
 *     in `test/help.test.ts` drives each entry through the real router and pins the
 *     command set against the router's own dispatch switch (both directions).
 *  2. **The exit-code taxonomy is sourced from `errors.ts`.** {@link exitCodeTaxonomy}
 *     is built from `EXIT_OK`/`EXIT_UNCAUGHT`/`EXIT_CODES` directly, so the
 *     manifest's global exit enumeration can never drift from the real mapping.
 *
 * Per-command `exitCodes` enumerate the codes a command can return through its own
 * contract, applied uniformly so siblings stay consistent: `0`; the universal `2`
 * (usage); `not_found` (3) when the command resolves a user-named path / id /
 * template / topic / command or loads the bundle; `denied` (4) when the command
 * **writes** to the filesystem (a permission failure on its write target is a
 * first-class outcome); and any `conflict` (5) / `validation`-or-`drift` (6)
 * specific to the command. An incidental `EACCES` *reading* an input file — which
 * any filesystem read could raise — is treated like `uncaught` (1): a generic
 * condition, not enumerated per read-only command. `1` (uncaught) is global-only
 * (cli-contract §5.1); the full taxonomy is in {@link Manifest.exitCodes}. `--json`
 * availability is universal — the flag is resolved once by the router and every
 * command emits the envelope — so `json` is `true` on every entry; it is carried
 * per command so a single entry is self-describing.
 */

import { EXIT_CODES, EXIT_OK, EXIT_UNCAUGHT } from "../errors";
import { SCHEMA_VERSION } from "../output";
import { LORE_COMMANDS } from "./agent-bridge";

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
  /** One-line description of what the command does (from `LORE_COMMANDS`). */
  readonly summary: string;
  /** The positional-argument signature (e.g. `<id> <taskId…>`), or `""` when the command takes none. */
  readonly args: string;
  /** The command's own flags (global `--json`/`--plain` are in {@link Manifest.globalFlags}, not repeated here). */
  readonly flags: readonly ManifestFlag[];
  /** Whether the command supports the `--json` envelope. Universal today, carried per command so an entry is self-describing. */
  readonly json: boolean;
  /** The `kind` of the command's `--json` success envelope (cli-contract §2.1), matching the live `kind:` literal. */
  readonly kind: string;
  /** The exit codes this command can return (see the module policy); `1` (uncaught) is global-only. */
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

/** The per-command detail this module layers onto each `LORE_COMMANDS` `{ name, summary }` pair. */
type CommandDetail = Omit<ManifestCommand, "name" | "summary">;

/** The four global flags the router resolves for every invocation (cli-contract §1). */
const GLOBAL_FLAGS: readonly ManifestFlag[] = [
  {
    name: "json",
    takesValue: false,
    summary: "Machine-readable JSON output (the {schemaVersion, kind, data} envelope)",
  },
  { name: "plain", takesValue: false, summary: "ANSI-free text output (auto-selected when stdout is piped)" },
  { name: "version", alias: "v", takesValue: false, summary: "Print the version and exit" },
  { name: "help", alias: "h", takesValue: false, summary: "Show help and exit" },
];

/** The `help` command's summary — `help` is not in `LORE_COMMANDS` (it post-dates the bridge), so it is defined here. */
const HELP_SUMMARY = "Show help, or the machine-readable command manifest under --json";

/**
 * Per-command detail keyed by dispatch name. Flags, `kind` values, and exit codes
 * are transcribed from live source (`commands/*.ts` arg parsers and `kind:`
 * literals; the `LoreError` types they and their core/shared helpers throw), not
 * from the design docs, which the manifest supersedes as the machine-readable
 * surface. `exitCodes` follow the module policy (writes → `denied` 4;
 * named-target/bundle resolution → `not_found` 3).
 */
const COMMAND_DETAILS: Readonly<Record<string, CommandDetail>> = {
  init: {
    args: "",
    flags: [],
    json: true,
    kind: "init",
    // writes the bundle (4); already-initialized (5); Backlog probe failure (6).
    exitCodes: [0, 2, 4, 5, 6],
    examples: ["lore init"],
  },
  new: {
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
    // resolves --template (3); writes the concept (4); target path exists (5); template missing a required var (6).
    exitCodes: [0, 2, 3, 4, 5, 6],
    examples: [
      'lore new story "Bulk archive completed orders"',
      'lore new adr "Use soft deletes" --tags retention,orders',
    ],
  },
  validate: {
    args: "[paths…]",
    flags: [
      { name: "type", takesValue: true, summary: "Limit the report to one concept type" },
      { name: "strict", takesValue: false, summary: "Treat warnings as errors for the exit code" },
    ],
    json: true,
    kind: "validate.report",
    // resolves path arguments (3); read-only; validation failure (6).
    exitCodes: [0, 2, 3, 6],
    examples: ["lore validate", "lore validate --type ADR --strict"],
  },
  check: {
    args: "[paths…]",
    flags: [
      { name: "strict", takesValue: false, summary: "Treat portability warnings as failures for the exit code" },
      { name: "external", takesValue: false, summary: "Also probe external-URL liveness (advisory; never gates)" },
    ],
    json: true,
    kind: "check.report",
    // resolves path arguments / a vanished linked task (3); read-only; drift (6).
    exitCodes: [0, 2, 3, 6],
    examples: ["lore check", "lore check --external"],
  },
  replace: {
    args: '"<find>" "<replace>"',
    flags: [
      { name: "regex", takesValue: false, summary: "Treat <find> as a regular expression" },
      { name: "in", takesValue: true, repeatable: true, summary: "Scope to a glob (default: whole bundle)" },
      { name: "dry-run", takesValue: false, summary: "Report matches, write nothing" },
    ],
    json: true,
    kind: "replace.result",
    // resolves a target path (3); writes the edited files (4).
    exitCodes: [0, 2, 3, 4],
    examples: ['lore replace "soft delete" "soft-delete" --in "docs/stories/**"'],
  },
  rename: {
    args: "<oldId> <newId>",
    flags: [{ name: "dry-run", takesValue: false, summary: "Report rewrites, move nothing" }],
    json: true,
    kind: "rename.result",
    // resolves oldId (3); moves/writes files (4); newId exists or collides (5); back-reference move drift (6).
    exitCodes: [0, 2, 3, 4, 5, 6],
    examples: ["lore rename stories/bulk-archive-orders stories/order-archival"],
  },
  supersede: {
    args: "<oldId> <newId>",
    flags: [
      { name: "rewrite-links", takesValue: false, summary: "Repoint inbound links to the successor" },
      { name: "dry-run", takesValue: false, summary: "Report the changes, write nothing" },
    ],
    json: true,
    kind: "supersede.result",
    // resolves both ids (3); writes frontmatter (4); already superseded (5).
    exitCodes: [0, 2, 3, 4, 5],
    examples: ["lore supersede adr/0007-old-decision adr/0012-new-decision --rewrite-links"],
  },
  link: {
    args: "<id> <taskId…>",
    flags: [{ name: "no-back-ref", takesValue: false, summary: "Skip the doc: label write to the task" }],
    json: true,
    kind: "link.result",
    // resolves concept + task ids (3); writes frontmatter / a managed region (4); case-insensitive id collision (5); back-reference edit drift (6).
    exitCodes: [0, 2, 3, 4, 5, 6],
    examples: ["lore link stories/bulk-archive-orders task-42 task-57"],
  },
  unlink: {
    args: "<id> <taskId…>",
    flags: [
      { name: "no-back-ref", takesValue: false, summary: "Leave the doc: label on the task" },
      { name: "allow-missing", takesValue: false, summary: "Tolerate <id> not resolving to a live concept" },
    ],
    json: true,
    kind: "unlink.result",
    // resolves the concept (3); writes frontmatter (4) via the same path as link; id collision (5); back-reference edit drift (6).
    exitCodes: [0, 2, 3, 4, 5, 6],
    examples: [
      "lore unlink stories/bulk-archive-orders task-42",
      "lore unlink stories/bulk-archive-orders task-42 --allow-missing",
    ],
  },
  sync: {
    args: "[paths…]",
    flags: [
      { name: "dry-run", takesValue: false, summary: "Report what would change, write nothing (docs/ or backlog/)" },
      { name: "no-index", takesValue: false, summary: "Skip index/log regeneration" },
    ],
    json: true,
    kind: "sync.result",
    // resolves a vanished linked task (3); writes docs + commits backlog/ (4); could not reconcile/commit (6).
    exitCodes: [0, 2, 3, 4, 6],
    examples: ["lore sync", "lore sync --dry-run"],
  },
  schema: {
    args: "export",
    flags: [
      { name: "out", takesValue: true, summary: "Output directory (default .lore/schemas/)" },
      { name: "type", takesValue: true, summary: "Export one type's schema" },
    ],
    json: true,
    kind: "schema.result",
    // writes the schema files (4); no user-named input to resolve.
    exitCodes: [0, 2, 4],
    examples: ["lore schema export"],
  },
  graph: {
    args: "[<id>]",
    flags: [
      { name: "dot", takesValue: false, summary: "Emit Graphviz DOT (mutually exclusive with --json)" },
      { name: "depth", takesValue: true, summary: "Bound the subgraph radius" },
    ],
    json: true,
    kind: "graph.export",
    // resolves the root id / loads the bundle (3); read-only.
    exitCodes: [0, 2, 3],
    examples: ["lore graph", "lore graph stories/bulk-archive-orders --dot"],
  },
  query: {
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
    // loads the bundle (3); read-only.
    exitCodes: [0, 2, 3],
    examples: ['lore query "soft delete retention"', "lore query --type Story --tag orders --status in-progress"],
  },
  context: {
    args: "<id>",
    flags: [
      { name: "max-tokens", takesValue: true, summary: "Token budget (labeled chars/4 estimate)" },
      { name: "depth", takesValue: true, summary: "Neighbor radius (default 1)" },
    ],
    json: true,
    kind: "context.export",
    // resolves the concept id / loads the bundle (3); read-only.
    exitCodes: [0, 2, 3],
    examples: ["lore context stories/bulk-archive-orders --max-tokens 4000 --depth 2"],
  },
  instructions: {
    args: "[<topic>]",
    flags: [],
    json: true,
    kind: "instructions.text",
    // resolves the topic key (3); static, no filesystem.
    exitCodes: [0, 2, 3],
    examples: ["lore instructions", "lore instructions linking"],
  },
  agents: {
    args: "",
    flags: [
      { name: "force", takesValue: false, summary: "Overwrite hand-edited generated files" },
      { name: "check", takesValue: false, summary: "Report drift without writing (CI gate for a stale bridge)" },
    ],
    json: true,
    kind: "agents.result",
    // writes the bridge files (4); --check found the bridge stale (6); no user-named input to resolve.
    exitCodes: [0, 2, 4, 6],
    examples: ["lore agents", "lore agents --check"],
  },
  help: {
    args: "[<command>]",
    flags: [],
    json: true,
    kind: "help.manifest",
    // resolves the command name (3); static, no filesystem.
    exitCodes: [0, 2, 3],
    examples: ["lore help", "lore help new", "lore help --json"],
  },
};

/** Look up a command's detail by name, throwing (at module load, via {@link LORE_MANIFEST}) if a `LORE_COMMANDS` entry has none. */
function detailFor(name: string): CommandDetail {
  const detail = COMMAND_DETAILS[name];
  if (detail === undefined) {
    throw new Error(`manifest: no COMMAND_DETAILS entry for command "${name}"`);
  }
  return detail;
}

/**
 * Every shipped command, in `cli.ts` dispatch order: the 16 `LORE_COMMANDS`
 * (name + summary shared with SKILL.md) enriched with per-command detail, then
 * `help` (which post-dates the bridge).
 */
const LORE_MANIFEST: readonly ManifestCommand[] = [
  ...LORE_COMMANDS.map((command) => ({ name: command.name, summary: command.summary, ...detailFor(command.name) })),
  { name: "help", summary: HELP_SUMMARY, ...detailFor("help") },
];

/**
 * The semantic exit-code taxonomy, name → code, built from the `errors.ts`
 * constants so it can never drift from the real mapping (`validation` and `drift`
 * intentionally share `6`; cli-contract §5.1/§5.3).
 */
export function exitCodeTaxonomy(): Record<string, number> {
  return { ok: EXIT_OK, uncaught: EXIT_UNCAUGHT, ...EXIT_CODES };
}

/** Build the full {@link Manifest} for `lore help --json`. */
export function buildManifest(): Manifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    exitCodes: exitCodeTaxonomy(),
    globalFlags: GLOBAL_FLAGS,
    commands: LORE_MANIFEST,
  };
}

/** Look up one command by its exact dispatch name (case-sensitive), or `undefined` if unknown. */
export function findManifestCommand(name: string): ManifestCommand | undefined {
  return LORE_MANIFEST.find((command) => command.name === name);
}

/** Every command name the manifest advertises, in dispatch order — the set the lockstep test pins against the router. */
export function manifestCommandNames(): readonly string[] {
  return LORE_MANIFEST.map((command) => command.name);
}
