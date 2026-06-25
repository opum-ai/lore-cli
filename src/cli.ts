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
import { EXIT_OK, LoreError, reportError, type Writer } from "./errors";
import { VERSION } from "./meta";
import { emit, errorRenderOpts, type OutputContext, type Renderable, resolveOutput } from "./output";

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
  const args = argv.slice(2);
  for (const [i, arg] of args.entries()) {
    // POSIX end-of-options: everything after a bare `--` is a positional, even if it
    // looks like a flag — so a future command can accept a value that begins with `-`.
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
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
        // A bare `-` is the conventional stdin/positional marker, not an unknown flag.
        if (arg.startsWith("-") && arg !== "-") {
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
 * router is testable without touching the real process.
 *
 * The output mode is resolved first, then **every** path runs under one try/catch:
 * unknown global flags are rejected before any short-circuit (so a typo'd flag never
 * slips through `--version`/`--help`/no-command to a silent exit 0), and `--version`/
 * `--help` render through the same {@link emit} seam as a command — a
 * `{schemaVersion, kind, data}` envelope under `--json`, plain text otherwise — so a
 * machine consumer that always pipes `--json` can decode their output too.
 */
export function run(argv: readonly string[], context: RunContext = {}): number {
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  const parsed = parseArgs(argv);
  const output = resolveOutput({
    json: parsed.json,
    plain: parsed.plain,
    // A caller that injects its own stdout sink but no TTY hint is not at a terminal,
    // so its mode resolves to plain (no stray ANSI in a captured buffer); only the
    // real-process path (no injected sink) reads the actual `process.stdout.isTTY`.
    isTTY: context.isTTY ?? (context.stdout ? false : process.stdout.isTTY),
    env: context.env ?? process.env,
  });
  try {
    rejectUnknownFlags(parsed.unknownFlags);
    if (parsed.version) {
      return emitMeta("version", { version: VERSION }, VERSION, output, stdout);
    }
    if (parsed.help || parsed.command === undefined) {
      return emitMeta("help", { usage: USAGE }, USAGE, output, stdout);
    }
    return dispatch(parsed, { ...context, stdout }, output);
  } catch (err) {
    return reportError(err, { ...errorRenderOpts(output), stderr });
  }
}

/**
 * Render a meta result (version / help) through the same {@link emit} seam a command
 * uses: a `{schemaVersion, kind, data}` envelope under `--json`, the plain `text`
 * otherwise. This is what keeps `lore --version --json` machine-parseable instead of a
 * bare line a `--json` consumer cannot decode.
 */
function emitMeta(
  kind: string,
  data: Record<string, string>,
  text: string,
  output: OutputContext,
  stdout: Writer,
): number {
  const renderable: Renderable<Record<string, string>> = { kind, data, pretty: () => text, plain: () => text };
  emit(renderable, output, stdout);
  return EXIT_OK;
}

/** Route a parsed invocation to its command handler, throwing a `usage` error on bad input. */
function dispatch(parsed: ParsedArgs, context: RunContext, output: OutputContext): number {
  switch (parsed.command) {
    case "init":
      rejectExtraPositionals(parsed.rest, "init");
      return runInit({ root: context.cwd || process.cwd(), output, stdout: context.stdout });
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
