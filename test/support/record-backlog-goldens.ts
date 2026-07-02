/**
 * record-backlog-goldens.ts — regenerate the committed Backlog.md `--json` golden fixtures
 * (LORE-13 AC#2). Run manually when the fork's serializer or the JSON contract changes:
 *
 * ```sh
 * # Uses the fork CLI directly (no compiled binary needed — `bun <fork>/src/cli.ts` works even on
 * # the external volume, where `bun build --compile` silent-fails; see the LORE-4 build notes).
 * LORE_BACKLOG_FORK_CLI=~/repos/Backlog.md/src/cli.ts bun test/support/record-backlog-goldens.ts
 * ```
 *
 * It shells the fork against **this repo's own `backlog/` project** (cwd), captures one envelope per
 * kind, redacts the host-specific absolute `filePath` to `{REPO}` and trims the list/search payloads
 * to a small, stable sample, then writes each as a canonical 2-space JSON file under
 * `test/fixtures/backlog-json/`. Generation is a fixpoint: the committed files equal
 * `canonicalize(redact(...))`, which is exactly what `backlog-json-golden.test.ts` asserts — so this
 * script is the *only* way a golden should change, never a hand-edit.
 *
 * This is dev tooling, not part of `bun test`: the golden test consumes the committed files and never
 * spawns the fork (CI has no fork binary). The captured goldens are a frozen snapshot of real fork
 * output; re-running here against a changed backlog will legitimately produce different bytes.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { canonicalize, type EnvelopeKind, redactRepoRoot } from "./backlog-golden";

/** How many entries to keep in the `taskList` / `searchResult` payloads — enough to prove shape, small enough to read. */
const SAMPLE_SIZE = 3;

/**
 * The task whose full `task view` shape is frozen as the `task`-kind golden. LORE-33 is a good
 * specimen: Done, with a plan, notes, two acceptance criteria, dependencies and documentation, and
 * a **null** `finalSummary` (so the golden exercises a populated-nullable and a null field), and its
 * prose carries no host-specific paths (unlike LORE-4, whose notes document absolute build paths).
 */
const TASK_VIEW_ID = process.env.LORE_GOLDEN_TASK_ID ?? "LORE-33";

/** The search query whose hits are frozen as the `searchResult`-kind golden. */
const SEARCH_QUERY = process.env.LORE_GOLDEN_SEARCH_QUERY ?? "json";

/** The fork CLI entrypoint — overridable, defaulting to the conventional local checkout (LORE-4 notes). */
const FORK_CLI = process.env.LORE_BACKLOG_FORK_CLI ?? join(homedir(), "repos", "Backlog.md", "src", "cli.ts");

/** Where the committed goldens live, resolved relative to this script. */
const FIXTURES_DIR = join(import.meta.dir, "..", "fixtures", "backlog-json");

/** The file each kind is written to. */
const GOLDEN_FILES: Record<EnvelopeKind, string> = {
  task: "task.json",
  taskList: "task-list.json",
  searchResult: "search-result.json",
};

/** Run the fork CLI with `args`, returning parsed stdout JSON or throwing with captured stderr. */
async function forkJson(args: readonly string[]): Promise<Record<string, unknown>> {
  const proc = Bun.spawn(["bun", FORK_CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`fork \`${args.join(" ")}\` exited ${exitCode}: ${stderr.trim()}`);
  }
  return JSON.parse(stdout) as Record<string, unknown>;
}

/** Trim an envelope's array `data` to the first {@link SAMPLE_SIZE} entries (task view's object data is untouched). */
function trimSample(envelope: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(envelope.data)) {
    return { ...envelope, data: envelope.data.slice(0, SAMPLE_SIZE) };
  }
  return envelope;
}

/** Capture one kind, redact + trim + canonicalize, and write its golden file. */
async function record(kind: EnvelopeKind, args: readonly string[], repoRoot: string): Promise<void> {
  const raw = await forkJson(args);
  const golden = redactRepoRoot(trimSample(raw), repoRoot);
  const path = join(FIXTURES_DIR, GOLDEN_FILES[kind]);
  writeFileSync(path, canonicalize(golden));
  console.log(`wrote ${path}`);
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  mkdirSync(FIXTURES_DIR, { recursive: true });
  await record("task", ["task", "view", TASK_VIEW_ID, "--json"], repoRoot);
  await record("taskList", ["task", "list", "--json"], repoRoot);
  await record("searchResult", ["search", SEARCH_QUERY, "--json"], repoRoot);
}

await main();
