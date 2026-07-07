/**
 * commands/instructions.ts — `lore instructions [<topic>]` (cli-surface §instructions).
 *
 * The thin, read-only layer over the static topic registry in
 * `core/instructions.ts`: it parses the one optional positional, looks up the
 * topic, and emits it. There is no bundle to load and no config to read, so
 * unlike most commands this one needs neither `root` nor a `WarningCollector`.
 *
 * With no `<topic>` it prints `overview` (the canonical loop + a topic index);
 * an unrecognized `<topic>` is a `not_found` error (exit 3) whose hint lists
 * the valid keys. This command takes no flags, so any `-`-prefixed token or a
 * second positional is a `usage` error (exit 2), matching every other
 * command's strict argument parsing.
 */

import { findInstructionTopic, INSTRUCTION_TOPICS, type InstructionTopic } from "../core/instructions";
import { ANSI, EXIT_OK, LoreError, paint, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";

/** Options for {@link runInstructions}; the streams are injectable for tests. */
export interface InstructionsOptions {
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional tokens (everything after `instructions`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
}

/** The `instructions.text` payload: the requested topic plus the full topic index, so a `--json` caller can discover the other keys without a second request. */
interface InstructionsData {
  /** The topic actually served (`overview` when no `<topic>` was given). */
  topic: string;
  /** The topic's one-line heading. */
  title: string;
  /** The topic's full guidance body. */
  body: string;
  /** Every topic `lore instructions` can serve, in index order. */
  topics: ReadonlyArray<{ key: string; title: string }>;
}

/** Run `lore instructions`: parse the optional `<topic>`, look it up, emit it, and return `0`. */
export function runInstructions(options: InstructionsOptions): number {
  const key = parseInstructionsArgs(options.args);
  const topic = findInstructionTopic(key);
  if (topic === undefined) {
    const validKeys = INSTRUCTION_TOPICS.map((t) => t.key).join(", ");
    throw new LoreError(
      "not_found",
      `unknown instructions topic "${key}"`,
      `valid topics: ${validKeys}; run \`lore instructions\` for the overview`,
      { topic: key },
    );
  }
  emit(instructionsRenderable(topic), options.output, options.stdout);
  return EXIT_OK;
}

/** Parse `instructions`' tokens: at most one positional (the topic key, defaulting to `overview`); any flag or second positional is a `usage` error. */
function parseInstructionsArgs(args: readonly string[]): string {
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "`lore instructions` takes no flags; run `lore instructions [<topic>]`");
    }
    positionals.push(arg);
  }
  if (positionals.length > 1) {
    throw usage(`unexpected argument "${positionals[1]}"`, "run `lore instructions [<topic>]`");
  }
  return positionals[0] ?? "overview";
}

/** Build the `instructions.text` {@link Renderable} for one topic. */
function instructionsRenderable(topic: InstructionTopic): Renderable<InstructionsData> {
  const data: InstructionsData = {
    topic: topic.key,
    title: topic.title,
    body: topic.body,
    topics: INSTRUCTION_TOPICS.map(({ key, title }) => ({ key, title })),
  };
  return { kind: "instructions.text", data, pretty: renderPretty, plain: renderPlain };
}

/** `<title>` heading (painted when `color`) + a blank line + the body. Shared by pretty/plain so the two differ only in color. */
function render(data: InstructionsData, color: boolean): string {
  return `${paint(data.title, ANSI.green, color)}\n\n${data.body}`;
}

function renderPretty(data: InstructionsData, opts: { color: boolean }): string {
  return render(data, opts.color);
}

function renderPlain(data: InstructionsData): string {
  return render(data, false);
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
