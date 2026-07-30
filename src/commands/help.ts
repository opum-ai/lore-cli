/**
 * commands/help.ts — `lore help [<command>]` (cli-surface §help).
 *
 * The thin, read-only layer over the capability manifest in `core/manifest.ts`:
 * it parses the one optional `<command>` positional and emits either the whole
 * manifest or one command's entry. Like `instructions`, there is no bundle to
 * load and no config to read, so it needs neither `root` nor a `WarningCollector`.
 *
 * - `lore help` — top-level help (the command catalog), rendered from the manifest.
 * - `lore help <command>` — one command's detailed help; an unknown `<command>`
 *   is a `not_found` error (exit 3) whose hint lists the valid names.
 * - `--json` — the `{schemaVersion, kind: "help.manifest", data}` envelope, where
 *   `data` is the full {@link Manifest} (or, for `lore help <command> --json`, the
 *   same {@link Manifest} shape scoped to the one requested command, so a consumer
 *   parses both forms identically).
 *
 * {@link renderTopLevelHelp} is exported so the router's `--help`/no-command
 * short-circuit renders from the same manifest — one source for all help text, no
 * separately-maintained `USAGE` literal to drift.
 */

import {
  buildManifest,
  findManifestCommand,
  type Manifest,
  type ManifestCommand,
  type ManifestFlag,
} from "../core/manifest";
import { EXIT_OK, LoreError, type Writer } from "../errors";
import { VERSION } from "../meta";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, usage } from "./args";

/** Options for {@link runHelp}; the stream is injectable for tests. */
export interface HelpOptions {
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized positional tokens from Commander. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
}

/** Run `lore help`: parse the optional `<command>`, resolve it, emit its (or the whole) manifest, and return `0`. */
export function runHelp(options: HelpOptions): number {
  const name = parseHelpArgs(options.args);
  const manifest = buildManifest();
  if (name !== undefined) {
    const command = findManifestCommand(name);
    if (command === undefined) {
      const validNames = manifest.commands.map((c) => c.name).join(", ");
      throw new LoreError(
        "not_found",
        `unknown command "${name}"`,
        `valid commands: ${validNames}; run \`lore help\` to list them`,
        { command: name },
      );
    }
    emit(commandHelpRenderable(manifest, command), options.output, options.stdout);
    return EXIT_OK;
  }
  emit(topLevelHelpRenderable(manifest), options.output, options.stdout);
  return EXIT_OK;
}

/** Parse `help`'s tokens via the shared parser (no known flags): at most one positional (the command name); a flag or second positional is a `usage` error. */
function parseHelpArgs(args: readonly string[]): string | undefined {
  const { positionals } = parseCommandArgs(args, "help");
  if (positionals.length > 1) {
    throw usage(`unexpected argument "${positionals[1]}"`, "run `lore help [<command>]`");
  }
  return positionals[0];
}

/** The whole-manifest {@link Renderable}: `data` is the full manifest; pretty/plain are the top-level command catalog. */
function topLevelHelpRenderable(manifest: Manifest): Renderable<Manifest> {
  const text = renderTopLevelHelp(manifest);
  return { kind: "help.manifest", data: manifest, pretty: () => text, plain: () => text };
}

/** One command's {@link Renderable}: `data` is the manifest scoped to that command (same shape as the full one); pretty/plain are its detailed help. */
function commandHelpRenderable(manifest: Manifest, command: ManifestCommand): Renderable<Manifest> {
  const text = renderCommandHelp(command);
  const data: Manifest = { ...manifest, commands: [command] };
  return { kind: "help.manifest", data, pretty: () => text, plain: () => text };
}

/**
 * Render the top-level help — the header, the command catalog, and the global
 * options — from the manifest. Uncolored, so the `lore help` command and the
 * `lore --help` flag (which the router feeds this same text) are byte-identical.
 * Exported for the router's `--help`/no-command short-circuit.
 */
export function renderTopLevelHelp(manifest: Manifest = buildManifest()): string {
  const nameWidth = Math.max(...manifest.commands.map((c) => c.name.length));
  const commands = manifest.commands
    .map((c) => `  ${c.name.padEnd(nameWidth)}  ${c.summary}${c.args ? ` (lore ${c.name} ${c.args})` : ""}`)
    .join("\n");
  const optWidth = Math.max(...manifest.globalFlags.map((f) => globalFlagLabel(f).length));
  const options = manifest.globalFlags.map((f) => `  ${globalFlagLabel(f).padEnd(optWidth)}  ${f.summary}`).join("\n");
  return `lore ${VERSION} — OKF-native documentation CLI

Usage:
  lore <command> [options]

Commands:
${commands}

Run \`lore help <command>\` for a command's arguments, flags, output, and exit codes.

Options:
${options}

Docs: docs/index.md`;
}

/** Render one command's detailed help: usage line, flags, output kind, exit codes, and examples. */
function renderCommandHelp(command: ManifestCommand): string {
  const lines: string[] = [
    `lore ${command.name} — ${command.summary}`,
    "",
    "Usage:",
    `  lore ${command.name}${command.args ? ` ${command.args}` : ""}`,
  ];
  if (command.flags.length > 0) {
    const width = Math.max(...command.flags.map((f) => commandFlagLabel(f).length));
    lines.push("", "Flags:");
    for (const flag of command.flags) {
      const note = flag.repeatable ? " (repeatable)" : "";
      lines.push(`  ${commandFlagLabel(flag).padEnd(width)}  ${flag.summary}${note}`);
    }
  }
  lines.push("", `Output:  ${command.kind} (--json envelope)`, `Exit codes:  ${command.exitCodes.join(", ")}`);
  if (command.examples.length > 0) {
    lines.push("", "Examples:");
    for (const example of command.examples) {
      lines.push(`  ${example}`);
    }
  }
  return lines.join("\n");
}

/** `-v, --version` when a flag has a short alias, else `--json`. */
function globalFlagLabel(flag: ManifestFlag): string {
  return flag.alias !== undefined ? `-${flag.alias}, --${flag.name}` : `--${flag.name}`;
}

/** `--type <value>` for a value-taking flag, else `--strict`. */
function commandFlagLabel(flag: ManifestFlag): string {
  return flag.takesValue ? `--${flag.name} <value>` : `--${flag.name}`;
}
