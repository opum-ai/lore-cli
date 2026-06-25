#!/usr/bin/env bun
/**
 * cli.ts — lore's primary surface (lore-design §2): a thin Commander-less router.
 *
 * It resolves global flags + the output mode once, dispatches a subcommand to its
 * thin handler in `commands/`, and funnels every thrown {@link LoreError} through the
 * one `reportError` seam so the exit-code/`--json`-envelope contract is identical
 * across commands (cli-contract §4–§5). The handler does the work and returns its
 * success code; the router owns parsing, mode resolution, and error reporting.
 *
 * Argument parsing is hand-rolled (no `commander` dependency) while the command
 * surface is small: this keeps the package dependency-neutral with respect to the
 * isolated-linker / EXDEV packaging constraints (ADR-0001). The design names
 * Commander as the eventual entrypoint; adopting it is deferred until the command
 * count justifies the dependency.
 */

import { runInit } from "./commands/init";
import { LoreError, reportError, type Writer } from "./errors";
import { VERSION } from "./meta";
import { errorRenderOpts, type OutputContext, resolveOutput } from "./output";

const USAGE = `lore ${VERSION} — OKF-native documentation CLI

Usage:
  lore <command> [options]

Commands:
  init            Scaffold an empty, conformant OKF bundle (.lore/ + docs/index.md)

Options:
  --json          Machine-readable JSON output (the {schemaVersion, kind, data} envelope)
  --plain         ANSI-free text output (auto-selected when stdout is piped)
  -v, --version   Print the version and exit
  -h, --help      Show this help and exit

Docs: docs/index.md`;

/** The global flags and positionals a single invocation resolves to. */
interface ParsedArgs {
  command?: string;
  rest: string[];
  json: boolean;
  plain: boolean;
  version: boolean;
  help: boolean;
  unknownFlags: string[];
}

/** Split `argv` into the known global flags, the subcommand, and its positionals. */
function parseArgs(argv: readonly string[]): ParsedArgs {
  let json = false;
  let plain = false;
  let version = false;
  let help = false;
  const positionals: string[] = [];
  const unknownFlags: string[] = [];
  for (const arg of argv.slice(2)) {
    switch (arg) {
      case "--json":
        json = true;
        break;
      case "--plain":
        plain = true;
        break;
      case "--version":
      case "-v":
        version = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          unknownFlags.push(arg);
        } else {
          positionals.push(arg);
        }
    }
  }
  return { command: positionals[0], rest: positionals.slice(1), json, plain, version, help, unknownFlags };
}

/** The injectable environment a {@link run} sees; every field defaults to the real process. */
export interface RunContext {
  stdout?: Writer;
  stderr?: Writer;
  env?: Record<string, string | undefined>;
  cwd?: string;
  isTTY?: boolean;
}

/**
 * Parse `argv`, dispatch the subcommand, and return the process exit code. Pure with
 * respect to its injected {@link RunContext} (streams, env, cwd, TTY) so the whole
 * router is testable without touching the real process. `--version`/`--help` and an
 * absent command short-circuit to stdout with exit `0` before any command runs;
 * everything else resolves the output mode and reports a thrown error through it.
 */
export function run(argv: readonly string[], context: RunContext = {}): number {
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  const parsed = parseArgs(argv);

  if (parsed.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.help || parsed.command === undefined) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }

  const output = resolveOutput({
    json: parsed.json,
    plain: parsed.plain,
    isTTY: context.isTTY ?? process.stdout.isTTY,
    env: context.env ?? process.env,
  });
  try {
    return dispatch(parsed, { ...context, stdout }, output);
  } catch (err) {
    return reportError(err, { ...errorRenderOpts(output), stderr });
  }
}

/** Route a parsed invocation to its command handler, throwing a `usage` error on bad input. */
function dispatch(parsed: ParsedArgs, context: RunContext, output: OutputContext): number {
  rejectUnknownFlags(parsed.unknownFlags);
  switch (parsed.command) {
    case "init":
      rejectExtraPositionals(parsed.rest, "init");
      return runInit({ root: context.cwd ?? process.cwd(), output, stdout: context.stdout });
    default:
      throw new LoreError("usage", `unknown command "${parsed.command}"`, "run `lore --help` to list commands", {
        command: parsed.command,
      });
  }
}

/** Throw a `usage` {@link LoreError} when any unrecognized flag was passed. */
function rejectUnknownFlags(unknownFlags: readonly string[]): void {
  if (unknownFlags.length > 0) {
    throw new LoreError("usage", `unknown option "${unknownFlags[0]}"`, "run `lore --help` to list options", {
      options: [...unknownFlags],
    });
  }
}

/** Throw a `usage` {@link LoreError} when a command that takes no positionals got some. */
function rejectExtraPositionals(rest: readonly string[], command: string): void {
  if (rest.length > 0) {
    throw new LoreError(
      "usage",
      `\`lore ${command}\` takes no arguments, got "${rest[0]}"`,
      `run \`lore ${command}\` with no positional arguments`,
      { command, unexpected: [...rest] },
    );
  }
}

// Only drive the real process when executed directly (not when imported by tests).
if (import.meta.main) {
  process.exit(run(process.argv));
}
