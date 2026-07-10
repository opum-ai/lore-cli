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

import type { BacklogAdapter } from "./adapters/backlog";
import { runAgents } from "./commands/agents";
import { type FetchLike, runCheck } from "./commands/check";
import { runContext } from "./commands/context";
import { runGraph } from "./commands/graph";
import { renderTopLevelHelp, runHelp } from "./commands/help";
import { runInit } from "./commands/init";
import { runInstructions } from "./commands/instructions";
import { runLink, runUnlink } from "./commands/link";
import { runNew } from "./commands/new";
import { runQuery } from "./commands/query";
import { runRename } from "./commands/rename";
import { runReplace } from "./commands/replace";
import { runSchema } from "./commands/schema";
import { runSupersede } from "./commands/supersede";
import { runSync } from "./commands/sync";
import { runValidate } from "./commands/validate";
import { EXIT_OK, EXIT_UNCAUGHT, LoreError, reportError, type Writer } from "./errors";
import { VERSION } from "./meta";
import { emit, errorRenderOpts, type OutputContext, type Renderable, resolveOutput } from "./output";

// The top-level help text (the `--help`/no-command catalog) is rendered from the
// capability manifest via `renderTopLevelHelp` (commands/help.ts) — one source
// for both `lore --help` and the `lore help` command, so no separately-maintained
// `USAGE` literal can drift from the real command surface (LORE-38).

/** The global flags, the subcommand, and the command's own argument tokens a single invocation resolves to. */
interface ParsedArgs {
  command?: string;
  /**
   * The ordered tokens after the command — its positionals **and** its own flags — for the
   * command to parse itself. Global flags are removed; a command that takes value-bearing
   * flags (e.g. `new --var k=v`) needs the raw tail, since only it knows which flags consume
   * a following token.
   */
  commandArgs: string[];
  json: boolean;
  plain: boolean;
  version: boolean;
  help: boolean;
  /** Unknown `-`-flags appearing **before** any command — a global usage error (e.g. `lore --bogus`). */
  leadingUnknownFlags: string[];
}

/**
 * Split `argv` into the global flags, the subcommand, and the command's own tokens.
 *
 * Global flags (`--json`/`--plain`/`-v`/`--version`/`-h`/`--help`) are recognized in **any**
 * position before a `--` and stripped (they set their bool, they do not reach the command).
 * The **first positional** (a non-`-` token, or a bare `-`) is the command; every token after
 * it — positionals and the command's own flags — is collected verbatim into
 * {@link ParsedArgs.commandArgs} for the command to parse, because only the command knows which
 * of its flags take a value.
 *
 * The POSIX `--` end-of-options marker is honored: before the command, the next token is the
 * command and the rest are its positionals; **after** the command, the marker and the remaining
 * tokens are forwarded verbatim so the command can take a value (e.g. a title) that begins with
 * `-`. Tokens after a `--` are never re-interpreted as flags. An unrecognized `-`-flag *before*
 * the command has no command to own it, so it is a global usage error
 * ({@link ParsedArgs.leadingUnknownFlags}); a `-`-token is never the command (it is an "unknown
 * option", not an "unknown command"), and a bare `-` is a positional.
 */
function parseArgs(argv: readonly string[]): ParsedArgs {
  let json = false;
  let plain = false;
  let version = false;
  let help = false;
  let command: string | undefined;
  const commandArgs: string[] = [];
  const leadingUnknownFlags: string[] = [];
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      if (command === undefined) {
        const rest = args.slice(i + 1);
        command = rest[0];
        commandArgs.push(...rest.slice(1));
      } else {
        commandArgs.push(arg, ...args.slice(i + 1));
      }
      break;
    }
    if (arg === "--json") {
      json = true;
    } else if (arg === "--plain") {
      plain = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("-") && arg !== "-") {
      if (command === undefined) {
        leadingUnknownFlags.push(arg);
      } else {
        commandArgs.push(arg);
      }
    } else if (command === undefined) {
      command = arg;
    } else {
      commandArgs.push(arg);
    }
  }
  return { command, commandArgs, json, plain, version, help, leadingUnknownFlags };
}

/** The injectable environment a {@link run} sees; every field defaults to the real process. */
export interface RunContext {
  stdout?: Writer;
  stderr?: Writer;
  env?: Record<string, string | undefined>;
  cwd?: string;
  isTTY?: boolean;
  /** The fetch `check --external` uses for liveness; defaults to the global `fetch`. Injected so a caller (or a test) controls or stubs the network. */
  fetch?: FetchLike;
  /** The Backlog adapter `link`/`unlink` use; defaults to the real `backlog` binary on PATH. Injected so a caller (or a test) touches no subprocess. */
  adapter?: BacklogAdapter;
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
export function run(argv: readonly string[], context: RunContext = {}): number | Promise<number> {
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
    rejectUnknownFlags(parsed.leadingUnknownFlags);
    if (parsed.version || parsed.help || parsed.command === undefined) {
      // The version/help/no-command paths short-circuit before any command runs, so no command
      // will validate the tail. A stray non-global flag here (e.g. `lore init --bogus --version`)
      // would otherwise slip through to a silent exit 0 — reject it, preserving the invariant
      // that a typo'd flag is never swallowed by `--version`/`--help`.
      rejectStrayCommandFlags(parsed.commandArgs);
      if (parsed.version) {
        return emitMeta("version", { version: VERSION }, VERSION, output, stdout);
      }
      const helpText = renderTopLevelHelp();
      return emitMeta("help", { usage: helpText }, helpText, output, stdout);
    }
    const result = dispatch(parsed, { ...context, stdout, stderr }, output);
    // The async command paths (`check --external`, `link`, `unlink`, `rename`, `sync`) return a Promise; a
    // rejection from one must funnel through the **same** error seam as a synchronous throw
    // (formatted diagnostic + the right exit code), not escape to the entrypoint's bare backstop.
    // The sync `catch` below cannot see an async rejection, so attach the seam to the promise here.
    if (result instanceof Promise) {
      return result.catch((err: unknown) => reportError(err, { ...errorRenderOpts(output), stderr }));
    }
    return result;
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

/**
 * Route a parsed invocation to its command handler, throwing a `usage` error on bad input. Returns
 * a `number` for the synchronous commands and a `Promise<number>` for the async ones — `check
 * --external` (whose liveness probe is non-deterministic network IO) and `link`/`unlink`/`rename`/
 * `sync` (which drive the Backlog adapter).
 */
function dispatch(parsed: ParsedArgs, context: RunContext, output: OutputContext): number | Promise<number> {
  const root = context.cwd || process.cwd();
  switch (parsed.command) {
    case "init":
      rejectCommandArgs(parsed.commandArgs, "init");
      return runInit({ root, output, stdout: context.stdout });
    case "new":
      return runNew({ root, output, args: parsed.commandArgs, stdout: context.stdout, stderr: context.stderr });
    case "validate":
      return runValidate({ root, output, args: parsed.commandArgs, stdout: context.stdout, stderr: context.stderr });
    case "check":
      return runCheck({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        fetch: context.fetch,
        adapter: context.adapter,
      });
    case "replace":
      return runReplace({ root, output, args: parsed.commandArgs, stdout: context.stdout, stderr: context.stderr });
    case "rename":
      return runRename({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        adapter: context.adapter,
      });
    case "supersede":
      return runSupersede({ root, output, args: parsed.commandArgs, stdout: context.stdout, stderr: context.stderr });
    case "link":
      return runLink({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        adapter: context.adapter,
      });
    case "unlink":
      return runUnlink({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        adapter: context.adapter,
      });
    case "sync":
      return runSync({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        adapter: context.adapter,
      });
    case "schema":
      return runSchema({ root, output, args: parsed.commandArgs, stdout: context.stdout });
    case "graph":
      return runGraph({ root, output, args: parsed.commandArgs, stdout: context.stdout, stderr: context.stderr });
    case "query":
      return runQuery({ root, output, args: parsed.commandArgs, stdout: context.stdout, stderr: context.stderr });
    case "context":
      return runContext({ root, output, args: parsed.commandArgs, stdout: context.stdout, stderr: context.stderr });
    case "instructions":
      return runInstructions({ output, args: parsed.commandArgs, stdout: context.stdout });
    case "agents":
      return runAgents({ root, output, args: parsed.commandArgs, stdout: context.stdout });
    case "help":
      return runHelp({ output, args: parsed.commandArgs, stdout: context.stdout });
    default:
      throw new LoreError("usage", `unknown command "${parsed.command}"`, "run `lore --help` to list commands", {
        command: parsed.command,
      });
  }
}

/** Throw a `usage` {@link LoreError} when any unrecognized leading flag was passed. */
function rejectUnknownFlags(unknownFlags: readonly string[]): void {
  if (unknownFlags.length > 0) {
    throw new LoreError("usage", `unknown option "${unknownFlags[0]}"`, "run `lore --help` to list options", {
      options: [...unknownFlags],
    });
  }
}

/**
 * Reject the stray flags in `commandArgs` on a path where no command will run
 * (version/help/no-command). Positionals and the `--` terminator are ignored — a leftover
 * positional that `--version` simply overrides is not an error; only an unrecognized `-`-flag
 * is, preserving the invariant that a typo'd flag is never swallowed by `--version`/`--help`.
 */
function rejectStrayCommandFlags(commandArgs: readonly string[]): void {
  const stray = commandArgs.find((token) => token.startsWith("-") && token !== "-" && token !== "--");
  if (stray !== undefined) {
    throw new LoreError("usage", `unknown option "${stray}"`, "run `lore --help` to list options", {
      options: [stray],
    });
  }
}

/**
 * Throw a `usage` {@link LoreError} when a command that takes no arguments got any. The `--`
 * end-of-options marker is a no-op and skipped (so `lore init --` still scaffolds); a leftover
 * `-`-flag is reported as an unknown option, a leftover positional as an unexpected argument,
 * so the diagnostic matches what the user actually mistyped.
 */
function rejectCommandArgs(commandArgs: readonly string[], command: string): void {
  const leftover = commandArgs.filter((token) => token !== "--");
  if (leftover.length === 0) {
    return;
  }
  const first = leftover[0] as string;
  if (first.startsWith("-") && first !== "-") {
    throw new LoreError("usage", `unknown option "${first}"`, "run `lore --help` to list options", {
      options: [...leftover],
    });
  }
  throw new LoreError(
    "usage",
    `\`lore ${command}\` takes no arguments, got "${first}"`,
    `run \`lore ${command}\` with no positional arguments`,
    { command, unexpected: [...leftover] },
  );
}

// Only drive the real process when executed directly (not when imported by tests). `run` returns a
// number for synchronous commands and a Promise for the async ones (`check --external`, `link`,
// `unlink`, `rename`, `sync`); it funnels its own async rejections through `reportError`, so `Promise.resolve(...).then` normally
// receives a numeric exit code. The `.catch` is a last-ditch backstop (e.g. `reportError` itself
// throwing) — `EXIT_UNCAUGHT` (1), the uncaught-fault code, not the validation gate's `6`.
if (import.meta.main) {
  Promise.resolve(run(process.argv)).then(
    (code) => process.exit(code),
    () => process.exit(EXIT_UNCAUGHT),
  );
}
