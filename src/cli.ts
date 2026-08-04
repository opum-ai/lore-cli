#!/usr/bin/env bun
/**
 * cli.ts — lore's primary surface (lore-design §2): a thin Commander entrypoint.
 *
 * It resolves global flags + the output mode once, dispatches a subcommand to its
 * thin handler in `commands/`, and funnels every thrown {@link LoreError} through the
 * one `reportError` seam so the exit-code/`--json`-envelope contract is identical
 * across commands (cli-contract §4–§5). The handler does the work and returns its
 * success code; the router owns parsing, mode resolution, and error reporting.
 *
 * Commander owns tokenization, option validation, positional collection, and
 * declarative subcommand routing. Lore retains its own output/error seams: every
 * parser failure is translated to a {@link LoreError}, and Commander is configured
 * never to exit the process or write directly to a real/injected stream.
 */

import { Command } from "commander";
import type { BacklogAdapter } from "./adapters/backlog";
import { runAgent } from "./commands/agent";
import { runAgents } from "./commands/agents";
import { commanderOption, commanderUnknownCommand, commanderUsageError } from "./commands/args";
import { runChanged } from "./commands/changed";
import { type FetchLike, type ResolveHost, runCheck } from "./commands/check";
import { runContext } from "./commands/context";
import { runExplorer } from "./commands/explorer";
import { runExport } from "./commands/export";
import { runGraph } from "./commands/graph";
import { renderTopLevelHelp, runHelp } from "./commands/help";
import { runImpact } from "./commands/impact";
import { type AgentAvailability, type InitPrompter, runInit } from "./commands/init";
import { runInstructions } from "./commands/instructions";
import { runLink, runUnlink } from "./commands/link";
import { runNew } from "./commands/new";
import { runOrphans } from "./commands/orphans";
import { runPath } from "./commands/path";
import { runProvenance } from "./commands/provenance";
import { runQuery } from "./commands/query";
import { runRename } from "./commands/rename";
import { runReplace } from "./commands/replace";
import { runScaffold } from "./commands/scaffold";
import { runSchema } from "./commands/schema";
import { runSnapshot } from "./commands/snapshot";
import { runSupersede } from "./commands/supersede";
import { runSync } from "./commands/sync";
import { runTasks } from "./commands/tasks";
import { runValidate } from "./commands/validate";
import { buildManifest } from "./core/manifest";
import { loadRetrievalGraph, type RetrievalGraphLoader } from "./core/retrieval";
import { EXIT_OK, EXIT_UNCAUGHT, LoreError, reportError, type Writer } from "./errors";
import { VERSION } from "./meta";
import { emit, errorRenderOpts, type OutputContext, type Renderable, resolveOutput } from "./output";

// The top-level help text (the `--help`/no-command catalog) is rendered from the
// capability manifest via `renderTopLevelHelp` (commands/help.ts) — one source
// for both `lore --help` and the `lore help` command, so no separately-maintained
// `USAGE` literal can drift from the real command surface (LORE-38).

/** The subcommand and normalized command-local tokens Commander resolved for one invocation. */
interface ParsedArgs {
  command: string;
  commandArgs: string[];
}

/** The ordinary global options Commander parses without invoking its built-in help/version exits. */
interface GlobalOptions {
  json: boolean;
  plain: boolean;
  version: boolean;
  help: boolean;
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
  /**
   * Internal graph/query/context backend seam. The real Commander dispatch uses
   * verified indexed retrieval with reference fallback; tests may inject either
   * conformance implementation without adding a public parser flag.
   */
  retrieval?: RetrievalGraphLoader;
  /** `lore init`'s interactive-wizard I/O seam (LORE-260); defaults to a real `readline` session over stdin/stderr. Injected so a caller (or a test) drives the wizard without a real terminal. */
  prompter?: InitPrompter;
  /** Injectable executable discovery for `lore init`; keeps router tests independent of the host PATH. */
  agentAvailability?: () => AgentAvailability;
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
  let parsed: ParsedArgs | undefined;
  const program = createProgram((invocation) => {
    parsed = invocation;
  });
  let parseError: unknown;
  try {
    program.parse(argv.slice(2), { from: "user" });
  } catch (error) {
    parseError = error;
  }
  const globals = program.opts<GlobalOptions>();
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
    json: globals.json,
    plain: globals.plain,
    // A caller that injects its own stdout sink but no TTY hint is not at a terminal,
    // so its mode resolves to plain (no stray ANSI in a captured buffer); only the
    // real-process path (no injected sink) reads the actual `process.stdout.isTTY`.
    isTTY: context.isTTY ?? (context.stdout ? false : process.stdout.isTTY),
    env: context.env ?? process.env,
    stderrIsTTY,
  });
  try {
    if (parseError !== undefined) {
      const unknownCommand = commanderUnknownCommand(parseError);
      // Lore's global meta flags intentionally short-circuit an otherwise unknown
      // positional command, matching the pre-Commander contract. Known commands still
      // parse all their flags first, so `lore init --bogus --version` remains an error.
      if (unknownCommand !== undefined && (globals.version || globals.help)) {
        parsed = { command: unknownCommand, commandArgs: [] };
      } else {
        throw commanderUsageError(parseError, parsed?.command);
      }
    }
    if (globals.version || parsed === undefined) {
      if (globals.version) {
        return emitMeta("version", { version: VERSION }, VERSION, output, stdout);
      }
      const helpText = renderTopLevelHelp();
      return emitMeta("help", { usage: helpText }, helpText, output, stdout);
    }
    if (globals.help) {
      // A command was given alongside `--help`/`-h` (in any position): render that
      // command's own detailed help — the same as `lore help <command>` — instead of
      // the generic top-level catalog, so `lore <cmd> --help` describes the command the
      // user actually typed (LORE-107). Still reject a stray unrecognized flag first (same
      // invariant as the `--version`/no-command paths above): a typo'd flag must never be
      // swallowed just because `--help` also appears on the line.
      return runHelp({ output, args: [parsed.command], stdout });
    }
    // `stderrIsTTY` is threaded into `dispatch`'s context the same way `stdinIsTTY` already is
    // (LORE-260 review round 2, BLOCKING-1): it was resolved above but never actually reached
    // `runInit`'s `InitOptions`, so the wizard's stdin-only gate could fire with a redirected
    // stderr — a caller sees no prompt yet the process blocks waiting for an answer.
    const result = dispatch(parsed, { ...context, stdout, stderr, stdinIsTTY, stderrIsTTY }, output);
    // Async command paths (external checks, Backlog mutations, and indexed
    // graph/query/context retrieval) return a Promise. A rejection from one
    // must funnel through the **same** error seam as a synchronous throw
    // (formatted diagnostic + the right exit code), not escape to the
    // entrypoint's bare backstop. The sync `catch` below cannot see an async
    // rejection, so attach the seam to the promise here.
    if (result instanceof Promise) {
      return result.catch((err: unknown) => reportError(err, { ...errorRenderOpts(output, stderrIsTTY), stderr }));
    }
    return result;
  } catch (err) {
    return reportError(err, { ...errorRenderOpts(output, stderrIsTTY), stderr });
  }
}

/** One command-local option occurrence, retained in input order for repeatable/duplicate parity. */
interface OptionOccurrence {
  readonly name: string;
  readonly value?: string;
}

/**
 * Build a fresh Commander graph for one invocation.
 *
 * The capability manifest is the declaration source for command names and flags,
 * and also drives Lore's generated help. Each command accepts a variadic positional
 * collection here so global `--help`/`--version` can short-circuit incomplete command
 * lines exactly as before; command-specific arity/value rules remain in the thin
 * handlers. Built-in help/version are disabled, output is swallowed, and
 * `exitOverride` turns every parser exit into a caught {@link CommanderError}.
 */
function createProgram(onInvocation: (parsed: ParsedArgs) => void): Command {
  const manifest = buildManifest();
  const program = new Command()
    .name("lore")
    .helpOption(false)
    .helpCommand(false)
    .showSuggestionAfterError(false)
    .exitOverride()
    .configureOutput({ writeOut: () => {}, writeErr: () => {} })
    // A variadic root positional lets Lore retain its exact unknown-command
    // classification (including a bare "-" and a token after a root "--").
    // Known declarative subcommands still win Commander's normal dispatch.
    .argument("[args...]")
    .action((args: string[]) => {
      const command = args[0];
      if (command !== undefined) {
        onInvocation({ command, commandArgs: args.slice(1) });
      }
    });

  for (const flag of manifest.globalFlags) {
    program.addOption(commanderOption(flag));
  }

  for (const definition of manifest.commands) {
    const occurrences: OptionOccurrence[] = [];
    const positionalSyntax = commanderPositionalSyntax(definition.args);
    const command = program
      .command(definition.name)
      .description(definition.summary)
      .helpOption(false)
      .exitOverride((error) => {
        (error as typeof error & { loreCommand?: string }).loreCommand = definition.name;
        throw error;
      })
      // Keep arity validation in the thin handlers so established Lore wording,
      // hints, and error metadata stay compatible. Commander still receives the
      // manifest-derived positional shape and performs token/end-of-options parsing.
      .allowExcessArguments(true)
      .arguments(positionalSyntax);
    for (const flag of definition.flags) {
      command.addOption(commanderOption(flag));
      command.on(`option:${flag.name}`, (value?: string) => {
        occurrences.push(value === undefined ? { name: flag.name } : { name: flag.name, value });
      });
    }
    command.action(function () {
      onInvocation({
        command: definition.name,
        commandArgs: normalizeCommandArgs(this.args, occurrences),
      });
    });
  }
  return program;
}

/**
 * Convert the manifest's human-facing positional signature to a permissive
 * Commander declaration. Required operands are intentionally made optional:
 * command handlers retain their established arity diagnostics, while Commander
 * owns positional tokenization and the literal `--` boundary.
 */
function commanderPositionalSyntax(signature: string): string {
  const operands = [...signature.matchAll(/([A-Za-z][A-Za-z0-9-]*)(…)?/g)].map((match) => ({
    name: match[1] as string,
    variadic: match[2] !== undefined,
  }));
  if (operands.length === 0) {
    // Commands with no documented operands still accept a compatibility catch-all
    // so their handlers can preserve the exact "takes no arguments" diagnostic.
    return "[args...]";
  }
  return operands.map(({ name, variadic }) => `[${name}${variadic ? "..." : ""}]`).join(" ");
}

/**
 * Reconstitute a stable command-local vector for the existing thin handlers.
 * Options are emitted in their original occurrence order using inline values, then
 * positionals. A literal `--` is inserted when a positional starts with `-`, so no
 * downstream command can accidentally reclassify a Commander positional as a flag.
 */
function normalizeCommandArgs(positionals: readonly string[], occurrences: readonly OptionOccurrence[]): string[] {
  const options = occurrences.map((occurrence) =>
    occurrence.value === undefined ? `--${occurrence.name}` : `--${occurrence.name}=${occurrence.value}`,
  );
  if (positionals.some((arg) => arg.startsWith("-") && arg !== "-")) {
    return [...options, "--", ...positionals];
  }
  return [...positionals, ...options];
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
 * a `number` for the synchronous commands and a `Promise<number>` for the async
 * ones — external checks, Backlog-backed mutations, and indexed
 * graph/query/context retrieval.
 */
type CommandHandler = (args: readonly string[], context: RunContext, output: OutputContext) => number | Promise<number>;

/** Handler registry; Commander/manifest own routing declarations, this table only injects Lore seams. */
const COMMAND_HANDLERS: Readonly<Record<string, CommandHandler>> = {
  init: (args, context, output) => {
    const root = context.cwd || process.cwd();
    return runInit({
      root,
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      stdinIsTTY: context.stdinIsTTY,
      stderrIsTTY: context.stderrIsTTY,
      jsonRequested: output.mode === "json",
      adapter: context.adapter,
      prompter: context.prompter,
      agentAvailability: context.agentAvailability,
    });
  },
  new: (args, context, output) =>
    runNew({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
    }),
  validate: (args, context, output) =>
    runValidate({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
    }),
  check: (args, context, output) =>
    runCheck({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      fetch: context.fetch,
      resolveHost: context.resolveHost,
      adapter: context.adapter,
    }),
  replace: (args, context, output) =>
    runReplace({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
    }),
  rename: (args, context, output) =>
    runRename({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  supersede: (args, context, output) =>
    runSupersede({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
    }),
  link: (args, context, output) =>
    runLink({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  unlink: (args, context, output) =>
    runUnlink({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  sync: (args, context, output) =>
    runSync({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  tasks: (args, context, output) =>
    runTasks({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  orphans: (args, context, output) =>
    runOrphans({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  schema: (args, context, output) =>
    runSchema({ root: context.cwd || process.cwd(), output, args, stdout: context.stdout }),
  scaffold: (args, context, output) =>
    runScaffold({ root: context.cwd || process.cwd(), output, args, stdout: context.stdout }),
  graph: (args, context, output) =>
    runGraph({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
      retrieval: context.retrieval ?? loadRetrievalGraph,
    }),
  path: (args, context, output) =>
    runPath({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
      retrieval: context.retrieval ?? loadRetrievalGraph,
    }),
  impact: (args, context, output) =>
    runImpact({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
      retrieval: context.retrieval ?? loadRetrievalGraph,
    }),
  snapshot: (args, context, output) =>
    runSnapshot({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  changed: (args, context, output) =>
    runChanged({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  provenance: (args, context, output) =>
    runProvenance({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  explorer: (args, context, output) =>
    runExplorer({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  export: (args, context, output) =>
    runExport({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
    }),
  query: (args, context, output) =>
    runQuery({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
      retrieval: context.retrieval ?? loadRetrievalGraph,
    }),
  context: (args, context, output) =>
    runContext({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
      retrieval: context.retrieval ?? loadRetrievalGraph,
    }),
  agent: (args, context, output) =>
    runAgent({
      root: context.cwd || process.cwd(),
      output,
      args,
      stdout: context.stdout,
      stderr: context.stderr,
      adapter: context.adapter,
      retrieval: context.retrieval ?? loadRetrievalGraph,
    }),
  instructions: (args, context, output) => runInstructions({ output, args, stdout: context.stdout }),
  agents: (args, context, output) =>
    runAgents({ root: context.cwd || process.cwd(), output, args, stdout: context.stdout }),
  help: (args, context, output) => runHelp({ output, args, stdout: context.stdout }),
};

/** Command-handler registry names in declarative dispatch order (test/bridge lockstep seam). */
export function commandHandlerNames(): readonly string[] {
  return Object.keys(COMMAND_HANDLERS);
}

function dispatch(parsed: ParsedArgs, context: RunContext, output: OutputContext): number | Promise<number> {
  const root = context.cwd || process.cwd();
  const handler = COMMAND_HANDLERS[parsed.command];
  if (handler === undefined) {
    throw new LoreError("usage", `unknown command "${parsed.command}"`, "run `lore --help` to list commands", {
      command: parsed.command,
    });
  }
  return handler(parsed.commandArgs, { ...context, cwd: root }, output);
}

// Only drive the real process when executed directly (not when imported by tests). `run` returns a
// number for synchronous commands and a Promise for the async ones; it funnels
// its own async rejections through `reportError`, so `Promise.resolve(...).then`
// normally receives a numeric exit code. The `.catch` is a last-ditch backstop
// (e.g. `reportError` itself throwing) — `EXIT_UNCAUGHT` (1), the uncaught-fault
// code, not the validation gate's `6`.
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
