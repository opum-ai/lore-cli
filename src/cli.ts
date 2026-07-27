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
import { type FetchLike, type ResolveHost, runCheck } from "./commands/check";
import { runContext } from "./commands/context";
import { runExport } from "./commands/export";
import { runGraph } from "./commands/graph";
import { renderTopLevelHelp, runHelp } from "./commands/help";
import { type InitPrompter, runInit } from "./commands/init";
import { runInstructions } from "./commands/instructions";
import { runLink, runUnlink } from "./commands/link";
import { runNew } from "./commands/new";
import { runOrphans } from "./commands/orphans";
import { runQuery } from "./commands/query";
import { runRename } from "./commands/rename";
import { runReplace } from "./commands/replace";
import { runScaffold } from "./commands/scaffold";
import { runSchema } from "./commands/schema";
import { runSupersede } from "./commands/supersede";
import { runSync } from "./commands/sync";
import { runTasks } from "./commands/tasks";
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
  /**
   * Whether **stderr** (not stdout) is a TTY. Gates ANSI color on the stderr diagnostic path
   * (`reportError`, cli-contract §6) independent of `isTTY` (stdout's own TTY state, which alone
   * drives `mode`/stdout's pretty color), AND (LORE-260 review round 2, BLOCKING-1) is the OTHER
   * half of `lore init`'s wizard gate alongside `stdinIsTTY`: every wizard question is written to
   * stderr, so a redirected stderr must veto the wizard even with a still-TTY stdin — gating on
   * `stdinIsTTY` alone left the wizard blocked on a prompt nobody could see (confirmed live under a
   * pty: `lore init >/dev/null 2>&1` hung forever). Defaults the same way `isTTY` does: an injected
   * `stderr` sink with no explicit hint here is treated as non-TTY; only the real-process path (no
   * injected sink) reads the actual `process.stderr.isTTY`, coerced to a strict boolean via
   * {@link coerceRealTTY} (LORE-250; a raw, uncoerced read is `undefined` — not
   * `false` — on a non-TTY stream and re-leaks color downstream, see that
   * function's doc).
   */
  stderrIsTTY?: boolean;
  /**
   * Whether **stdin** is a TTY — one half of `lore init`'s wizard gate (LORE-260, cli-contract's
   * non-interactive mandate; see {@link stderrIsTTY} for the other half). Independent of `isTTY`
   * (stdout's own TTY state) and `stderrIsTTY`: a real terminal session normally has all three true,
   * but a script piping input while capturing output can have any combination. Defaults the same way
   * `isTTY`/`stderrIsTTY` do: an injected `stdout` sink with no explicit hint here is treated as
   * non-TTY (so a test harness never accidentally enables a blocking prompt); only the real-process
   * path (no injected sink) reads the actual `process.stdin.isTTY`, coerced to a strict boolean via
   * {@link coerceRealTTY}.
   */
  stdinIsTTY?: boolean;
  /** The fetch `check --external` uses for liveness; defaults to the global `fetch`. Injected so a caller (or a test) controls or stubs the network. */
  fetch?: FetchLike;
  /** DNS resolution `check --external`'s SSRF guard uses (LORE-71); defaults to real `node:dns`. Injected so a caller (or a test) controls or stubs DNS. */
  resolveHost?: ResolveHost;
  /** The Backlog adapter `link`/`unlink` use; defaults to the real `backlog` binary on PATH. Injected so a caller (or a test) touches no subprocess. */
  adapter?: BacklogAdapter;
  /** `lore init`'s interactive-wizard I/O seam (LORE-260); defaults to a real `readline` session over stdin/stderr. Injected so a caller (or a test) drives the wizard without a real terminal. */
  prompter?: InitPrompter;
}

/**
 * Coerce a real (uninjected) stream's `.isTTY` reading to a strict boolean.
 *
 * Node/Bun leave `process.stdout.isTTY` / `process.stderr.isTTY` **unset** —
 * `undefined`, not `false` — on a non-TTY stream (a pipe, or a `>`/`2>`
 * redirect); @types/node's `boolean | undefined` typing on the property does
 * not make this visible at the type level. `resolveOutput`'s `stderrIsTTY`
 * input (output.ts) and `errorRenderOpts`'s `stderrIsTTY` parameter both
 * default an *absent* value to `true` — a deliberate no-op for callers that
 * never pass the field at all, so every pre-LORE-250 call site keeps its exact
 * prior behavior. That default cannot distinguish "the caller didn't pass
 * this" from "the real stream's `.isTTY` happened to read as `undefined`
 * because it isn't a terminal" — so handing either of those functions an
 * uncoerced `.isTTY` read is indistinguishable from omitting the field
 * entirely, and silently falls back to "assume TTY", reopening the exact
 * color leak this coercion exists to close.
 *
 * Confirmed live at HEAD under a real pty before this fix (LORE-250, round
 * 3 review): `script -q /dev/null zsh -c 'bun src/cli.ts <cmd> 2>err.log'`
 * painted ANSI into `err.log` even though stderr was plainly redirected,
 * because the uncoerced real-process read reached `resolveOutput`/
 * `errorRenderOpts` as `undefined` and both `?? true` defaults swallowed it.
 *
 * `=== true` has no such ambiguity: every non-`true` reading (`undefined` or
 * `false`) coerces to `false`, so the value `run()` computes from a real
 * stream is always a genuine boolean, never `undefined` — the `?? true`
 * defaults downstream are only ever reached by a caller that omitted the
 * field outright.
 */
export function coerceRealTTY(isTTY: boolean | undefined): boolean {
  return isTTY === true;
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
 * machine consumer that always pipes `--json` can decode their output too. `--help`/`-h`
 * given *with* a command (e.g. `lore query --help`) renders that command's own detailed
 * help via {@link runHelp} rather than the top-level catalog — only a bare `--help`/no
 * command falls through to {@link renderTopLevelHelp} (LORE-107).
 */
export function run(argv: readonly string[], context: RunContext = {}): number | Promise<number> {
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  const parsed = parseArgs(argv);
  // Stderr's own TTY state, independent of stdout's — same injected-sink-defaults-
  // non-TTY / real-process-defaults-real-TTY shape as `isTTY` below, but read from
  // `stderr` so a redirected `2>` is never mistaken for a terminal just because
  // stdout is one (LORE-250, cli-contract §6). Computed *before* `resolveOutput`
  // so it can be folded into `output.color` at the source (see `resolveOutput`'s
  // `stderrIsTTY` input) — the single point every downstream consumer already
  // reads, including the `WarningCollector.flush({ color: options.output.color,
  // ... })` call sites in `commands/*.ts`, which never receive `stderrIsTTY`
  // directly and would otherwise leak stdout's color onto a redirected stderr.
  //
  // The real-process branch reads `process.stderr.isTTY` through
  // `coerceRealTTY`, NOT bare — Node/Bun leave that property `undefined` (not
  // `false`) on a non-TTY stream, and an uncoerced `undefined` here is
  // indistinguishable from "the field was never passed", which silently
  // re-triggers `resolveOutput`'s/`errorRenderOpts`'s `?? true` back-compat
  // defaults and reopens the leak this line exists to close (LORE-250, round
  // 3 — see {@link coerceRealTTY}'s doc for the confirmed real-pty repro).
  const stderrIsTTY = context.stderrIsTTY ?? (context.stderr ? false : coerceRealTTY(process.stderr.isTTY));
  // Same injected-sink-defaults-non-TTY / real-process-defaults-real-TTY shape as `stderrIsTTY`
  // above, keyed off `stdout` (not a `stdin` field — there is no injected stdin stream in
  // `RunContext`, only this resolved boolean) since a test harness that injects capturing streams
  // is never a real terminal session on any of the three streams.
  const stdinIsTTY = context.stdinIsTTY ?? (context.stdout ? false : coerceRealTTY(process.stdin.isTTY));
  const output = resolveOutput({
    json: parsed.json,
    plain: parsed.plain,
    // A caller that injects its own stdout sink but no TTY hint is not at a terminal,
    // so its mode resolves to plain (no stray ANSI in a captured buffer); only the
    // real-process path (no injected sink) reads the actual `process.stdout.isTTY`.
    isTTY: context.isTTY ?? (context.stdout ? false : process.stdout.isTTY),
    env: context.env ?? process.env,
    stderrIsTTY,
  });
  try {
    rejectUnknownFlags(parsed.leadingUnknownFlags);
    if (parsed.version || parsed.command === undefined) {
      // The version/no-command paths short-circuit before any command runs, so no command
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
    if (parsed.help) {
      // A command was given alongside `--help`/`-h` (in any position): render that
      // command's own detailed help — the same as `lore help <command>` — instead of
      // the generic top-level catalog, so `lore <cmd> --help` describes the command the
      // user actually typed (LORE-107). Still reject a stray unrecognized flag first (same
      // invariant as the `--version`/no-command paths above): a typo'd flag must never be
      // swallowed just because `--help` also appears on the line.
      rejectStrayCommandFlags(parsed.commandArgs);
      return runHelp({ output, args: [parsed.command], stdout });
    }
    // `stderrIsTTY` is threaded into `dispatch`'s context the same way `stdinIsTTY` already is
    // (LORE-260 review round 2, BLOCKING-1): it was resolved above but never actually reached
    // `runInit`'s `InitOptions`, so the wizard's stdin-only gate could fire with a redirected
    // stderr — a caller sees no prompt yet the process blocks waiting for an answer.
    const result = dispatch(parsed, { ...context, stdout, stderr, stdinIsTTY, stderrIsTTY }, output);
    // The async command paths (`check --external`, `link`, `unlink`, `rename`, `sync`) return a Promise; a
    // rejection from one must funnel through the **same** error seam as a synchronous throw
    // (formatted diagnostic + the right exit code), not escape to the entrypoint's bare backstop.
    // The sync `catch` below cannot see an async rejection, so attach the seam to the promise here.
    if (result instanceof Promise) {
      return result.catch((err: unknown) => reportError(err, { ...errorRenderOpts(output, stderrIsTTY), stderr }));
    }
    return result;
  } catch (err) {
    return reportError(err, { ...errorRenderOpts(output, stderrIsTTY), stderr });
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
      return runInit({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        stdinIsTTY: context.stdinIsTTY,
        // Both threaded from the SAME resolved values `run()` already computed above — the wizard's
        // TTY gate needs stderr's state too (BLOCKING-1: every wizard question is written to
        // stderr), and `--json` is an independent veto since a machine-readable run must never
        // prompt (review round 2).
        stderrIsTTY: context.stderrIsTTY,
        jsonRequested: parsed.json,
        adapter: context.adapter,
        prompter: context.prompter,
      });
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
        resolveHost: context.resolveHost,
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
    case "tasks":
      return runTasks({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        adapter: context.adapter,
      });
    case "orphans":
      return runOrphans({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        adapter: context.adapter,
      });
    case "schema":
      return runSchema({ root, output, args: parsed.commandArgs, stdout: context.stdout });
    case "scaffold":
      return runScaffold({ root, output, args: parsed.commandArgs, stdout: context.stdout });
    case "graph":
      return runGraph({ root, output, args: parsed.commandArgs, stdout: context.stdout, stderr: context.stderr });
    case "export":
      return runExport({
        root,
        output,
        args: parsed.commandArgs,
        stdout: context.stdout,
        stderr: context.stderr,
        adapter: context.adapter,
      });
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
 * Only tokens **before** the first `--` are scanned: per the parser's contract (line 78 above),
 * a token after the terminator is a positional, never re-interpreted as a flag, so
 * `lore --version tasks -- -x` must print the version rather than error (LORE-223).
 */
function rejectStrayCommandFlags(commandArgs: readonly string[]): void {
  const dashDashIndex = commandArgs.indexOf("--");
  const scanned = dashDashIndex === -1 ? commandArgs : commandArgs.slice(0, dashDashIndex);
  const stray = scanned.find((token) => token.startsWith("-") && token !== "-");
  if (stray !== undefined) {
    throw new LoreError("usage", `unknown option "${stray}"`, "run `lore --help` to list options", {
      options: [stray],
    });
  }
}

// Only drive the real process when executed directly (not when imported by tests). `run` returns a
// number for synchronous commands and a Promise for the async ones (`check --external`, `link`,
// `unlink`, `rename`, `sync`); it funnels its own async rejections through `reportError`, so `Promise.resolve(...).then` normally
// receives a numeric exit code. The `.catch` is a last-ditch backstop (e.g. `reportError` itself
// throwing) — `EXIT_UNCAUGHT` (1), the uncaught-fault code, not the validation gate's `6`.
//
// Setting `process.exitCode` rather than calling `process.exit()` is deliberate (LORE-70):
// `emit`/`reportError`'s writes to `process.stdout`/`process.stderr` are async for a piped
// destination, and `process.exit()` tears the process down without waiting for them to
// drain — a large `--json` payload silently truncates at the pipe's internal buffer size
// with a misleading exit code 0. Leaving the exit to the runtime lets pending writes (and
// any other pending I/O) finish naturally before the process ends with the recorded code.
if (import.meta.main) {
  Promise.resolve(run(process.argv)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.exitCode = EXIT_UNCAUGHT;
    },
  );
}
