/**
 * commands/args.ts — the shared Commander-backed command parser.
 *
 * Command names and options come from `core/manifest.ts`, the same declaration
 * source used by the top-level Commander graph and generated help. Thin command
 * handlers retain only command-specific arity/value/business validation.
 */

import { posix } from "node:path";
import { Command, CommanderError, Option } from "commander";
import { findManifestCommand, type ManifestFlag } from "../core/manifest";
import { RESERVED_STEMS } from "../core/scaffold";
import type { WorkspaceRetrievalSelection } from "../core/workspace-retrieval";
import { LoreError } from "../errors";

/** Commander parse failure enriched by the local subcommand that raised it. */
interface CommandScopedError extends CommanderError {
  loreCommand?: string;
}

/** The parsed form of a command's arguments. */
export interface ParsedArgs {
  /** Every non-flag token, in order (everything after a `--` marker included verbatim). */
  readonly positionals: string[];
  /** The set of recognized `--flag` names that were passed. */
  readonly flags: ReadonlySet<string>;
  /** Every value occurrence for each value-taking flag, in command-line order. */
  readonly values: ReadonlyMap<string, readonly string[]>;
  /** Number of times each option occurred, including boolean switches. */
  readonly counts: ReadonlyMap<string, number>;
}

/**
 * Parse one command's tokens with a fresh local Commander instance sourced from
 * its manifest declaration. A variadic positional captures all operands so each
 * thin handler can preserve its established arity wording and input metadata.
 */
export function parseCommandArgs(args: readonly string[], command: string): ParsedArgs {
  const definition = findManifestCommand(command);
  if (definition === undefined) {
    throw new Error(`missing CLI manifest definition for command "${command}"`);
  }
  const flags = new Set<string>();
  const values = new Map<string, string[]>();
  const counts = new Map<string, number>();
  const parser = new Command(command)
    .helpOption(false)
    .helpCommand(false)
    .showSuggestionAfterError(false)
    .exitOverride()
    .configureOutput({ writeOut: () => {}, writeErr: () => {} })
    .argument("[args...]")
    .action(() => {});
  for (const flag of definition.flags) {
    parser.addOption(commanderOption(flag));
    parser.on(`option:${flag.name}`, (value?: string) => {
      flags.add(flag.name);
      counts.set(flag.name, (counts.get(flag.name) ?? 0) + 1);
      if (value !== undefined) {
        const collected = values.get(flag.name) ?? [];
        collected.push(value);
        values.set(flag.name, collected);
      }
    });
  }
  try {
    parser.parse([...args], { from: "user" });
  } catch (error) {
    throw commanderUsageError(error, command);
  }
  return { positionals: [...parser.args], flags, values, counts };
}

/** Commander flag declaration sourced from one manifest flag. */
export function optionSyntax(flag: ManifestFlag): string {
  const long = `--${flag.name}${flag.takesValue ? " <value>" : ""}`;
  return flag.alias === undefined ? long : `-${flag.alias}, ${long}`;
}

/**
 * Build one Commander option with Lore's compatibility rule for separated
 * values: a required option must not consume a following long/global flag.
 * Commander normally accepts such tokens as values; Lore has always reported
 * the preceding option as value-less instead.
 */
export function commanderOption(flag: ManifestFlag): Option {
  const option = new Option(optionSyntax(flag), flag.summary);
  if (flag.takesValue) {
    option.argParser((value) => {
      if (value.startsWith("--") || value === "-h" || value === "-v") {
        throw usage(`--${flag.name} needs a value`, `pass a value, e.g. --${flag.name}=<value>`);
      }
      return value;
    });
  }
  return option;
}

/** Extract an unknown command from a Commander failure. */
export function commanderUnknownCommand(error: unknown): string | undefined {
  if (!(error instanceof CommanderError) || error.code !== "commander.unknownCommand") {
    return undefined;
  }
  return /unknown command '([^']+)'/.exec(error.message)?.[1];
}

/** Translate a caught Commander parser failure into Lore's semantic usage error. */
export function commanderUsageError(error: unknown, command?: string): LoreError {
  if (!(error instanceof CommanderError)) {
    throw error;
  }
  const scopedCommand = command ?? (error as CommandScopedError).loreCommand;
  const unknownCommand = commanderUnknownCommand(error);
  if (unknownCommand !== undefined) {
    return new LoreError("usage", `unknown command "${unknownCommand}"`, "run `lore --help` to list commands", {
      command: unknownCommand,
    });
  }
  const unknownOption = /unknown option '([^']+)'/.exec(error.message)?.[1];
  if (unknownOption !== undefined) {
    const equals = unknownOption.indexOf("=");
    if (scopedCommand !== undefined && equals > 0) {
      const option = unknownOption.slice(0, equals);
      const name = option.startsWith("--") ? option.slice(2) : option;
      const declared = findManifestCommand(scopedCommand)?.flags.find((flag) => flag.name === name);
      if (declared !== undefined && !declared.takesValue) {
        return usage(`${option} takes no value`, `pass ${option} on its own`);
      }
    }
    const scope = scopedCommand === undefined ? "lore --help" : `lore ${scopedCommand} --help`;
    return new LoreError("usage", `unknown option "${unknownOption}"`, `run \`${scope}\` to list options`, {
      options: [unknownOption],
    });
  }
  const missingValue = /option '([^']+)' argument missing/.exec(error.message)?.[1];
  if (missingValue !== undefined) {
    const flag = missingValue.split(/[ ,]/, 1)[0] as string;
    return usage(`${flag} needs a value`, `pass a value, e.g. ${flag}=<value>`);
  }
  return usage(
    error.message.replace(/^error:\s*/, ""),
    scopedCommand === undefined
      ? "run `lore --help` to list commands and options"
      : `run \`lore ${scopedCommand} --help\``,
  );
}

/** Return all values for a flag, or an empty array when it was absent. */
export function optionValues(parsed: ParsedArgs, name: string): readonly string[] {
  return parsed.values.get(name) ?? [];
}

/** Return a single flag value, rejecting a duplicate with the established Lore wording. */
export function singleOptionValue(parsed: ParsedArgs, name: string): string | undefined {
  const values = optionValues(parsed, name);
  if (values.length > 1) {
    throw usage(`--${name} given more than once`, `pass --${name} at most once`);
  }
  return values[0];
}

/** Reject duplicate boolean occurrences for commands whose prior contract did so. */
export function assertFlagAtMostOnce(parsed: ParsedArgs, name: string): void {
  if ((parsed.counts.get(name) ?? 0) > 1) {
    throw usage(`--${name} given more than once`, `pass --${name} at most once`);
  }
}

/** Parse the shared explicit workspace/repository selection flags. */
export function workspaceSelection(parsed: ParsedArgs): WorkspaceRetrievalSelection | undefined {
  const rawManifest = singleOptionValue(parsed, "workspace");
  const memberIds = optionValues(parsed, "repository").map((value) => value.trim());
  if (rawManifest === "" || rawManifest?.trim() === "") {
    throw usage("--workspace needs a value", "pass an explicit lore-workspace-manifest/1 JSON file");
  }
  if (memberIds.some((memberId) => memberId === "")) {
    throw usage("--repository needs a value", "pass a member id declared by the explicit workspace manifest");
  }
  if (rawManifest === undefined) {
    if (memberIds.length > 0)
      throw usage("--repository requires --workspace", "select an explicit workspace manifest first");
    return undefined;
  }
  if (new Set(memberIds).size !== memberIds.length) {
    throw usage("--repository values must be unique", "pass each selected workspace member at most once");
  }
  return { manifestPath: rawManifest.trim(), memberIds };
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
export function usage(message: string, hint: string, input?: unknown): LoreError {
  return new LoreError("usage", message, hint, input);
}

/**
 * Reject a reserved hub stem (`index`/`log`) as a `<action>` target/principal — a `usage` error.
 * Shared by `rename.ts`, `supersede.ts`, and `link.ts` so the policy (which stems are reserved, and
 * its wording) can't drift across the three independently. `action` is the verb phrase for the
 * message, e.g. `"rename to"`, `"supersede"`, `"link"`/`"unlink"`.
 */
export function assertNotReservedStem(id: string, action: string): void {
  if (RESERVED_STEMS.has(posix.basename(id))) {
    throw usage(
      `cannot ${action} "${id}": "${posix.basename(id)}" is a reserved, machine-generated file name`,
      "index.md/log.md are generated by lore, not authored concepts",
      { id },
    );
  }
}
