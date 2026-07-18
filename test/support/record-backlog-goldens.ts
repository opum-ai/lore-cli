/**
 * record-backlog-goldens.ts — regenerate the committed Backlog.md `--json` golden fixtures
 * (LORE-13 AC#2; migrated to upstream's contract by LORE-54). Run manually when upstream's
 * serializer or the JSON contract changes:
 *
 * ```sh
 * # Point at a local clone of MrLesk/Backlog.md checked out at or past the PR #790 merge commit
 * # (22a091b570d44c4f302ca47e7fd36fa28ad8bcb0; docs/runbooks/backlog-json-patch.md §8.1), with
 * # `bun install` already run. `bun <upstream>/src/cli.ts` works even on the external volume, where
 * # `bun build --compile` silent-fails (LORE-4 build notes).
 * LORE_BACKLOG_UPSTREAM_CLI=~/repos/Backlog.md-upstream/src/cli.ts bun test/support/record-backlog-goldens.ts
 * ```
 *
 * It shells the upstream CLI against **this repo's own `backlog/` project** (cwd), captures one
 * envelope per kind, trims the list/search payloads to a small, stable sample, then writes each as a
 * canonical 2-space JSON file under `test/fixtures/backlog-json/`. No redaction step is needed:
 * unlike the fork's shape, upstream's envelope carries no absolute, host-specific field — `task
 * view`'s `path` is already project-relative (backlog-json-schema.md §6). Generation is a fixpoint:
 * the committed files equal `canonicalize(trim(...))`, which is exactly what
 * `backlog-json-golden.test.ts` asserts — so this script is the *only* way a golden should change,
 * never a hand-edit.
 *
 * This is dev tooling, not part of `bun test`: the golden test consumes the committed files and never
 * spawns upstream (CI has no upstream binary). The captured goldens are a frozen snapshot of real
 * upstream output; re-running here against a changed backlog will legitimately produce different
 * bytes.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { canonicalize, type EnvelopeKind } from "./backlog-golden";

/** How many entries to keep in the `task-list` / `search` payloads — enough to prove shape, small enough to read. */
const SAMPLE_SIZE = 3;

/**
 * The task whose full `task view` shape is frozen as the `task-view`-kind golden. LORE-33 is a good
 * specimen: Done, with a plan, notes, two acceptance criteria, dependencies and documentation, and a
 * **null** `finalSummary` (so the golden exercises a populated-nullable and a null field), and its
 * prose carries no host-specific paths (unlike LORE-4, whose notes document absolute build paths —
 * moot for the envelope itself since LORE-54, but still a cleaner specimen for readable free text).
 */
const TASK_VIEW_ID = process.env.LORE_GOLDEN_TASK_ID ?? "LORE-33";

/** The search query whose hits are frozen as the `search`-kind golden. */
const SEARCH_QUERY = process.env.LORE_GOLDEN_SEARCH_QUERY ?? "json";

/** The upstream CLI entrypoint — overridable; no fixed conventional path since this is manually built dev tooling. */
const UPSTREAM_CLI =
  process.env.LORE_BACKLOG_UPSTREAM_CLI ?? join(homedir(), "repos", "Backlog.md-upstream", "src", "cli.ts");

/** Where the committed goldens live, resolved relative to this script. */
const FIXTURES_DIR = join(import.meta.dir, "..", "fixtures", "backlog-json");

/** The file each kind is written to, matching upstream's own hyphenated `kind` spelling. */
const GOLDEN_FILES: Record<EnvelopeKind, string> = {
  "task-view": "task-view.json",
  "task-list": "task-list.json",
  search: "search.json",
};

/** Run the upstream CLI with `args`, returning parsed stdout JSON or throwing with captured stderr. */
async function upstreamJson(args: readonly string[]): Promise<Record<string, unknown>> {
  const proc = Bun.spawn(["bun", UPSTREAM_CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`upstream \`${args.join(" ")}\` exited ${exitCode}: ${stderr.trim()}`);
  }
  return JSON.parse(stdout) as Record<string, unknown>;
}

/** Trim an envelope's array payload (`tasks`/`results`) to the first {@link SAMPLE_SIZE} entries; `task-view`'s object payload (`arrayKey` undefined) is untouched. */
function trimSample(
  envelope: Record<string, unknown>,
  arrayKey: "tasks" | "results" | undefined,
): Record<string, unknown> {
  if (arrayKey === undefined) {
    return envelope;
  }
  const arr = envelope[arrayKey];
  return Array.isArray(arr) ? { ...envelope, [arrayKey]: arr.slice(0, SAMPLE_SIZE) } : envelope;
}

/** Capture one kind, trim + canonicalize, and write its golden file. */
async function record(
  kind: EnvelopeKind,
  args: readonly string[],
  arrayKey: "tasks" | "results" | undefined,
): Promise<void> {
  const raw = await upstreamJson(args);
  const golden = trimSample(raw, arrayKey);
  const path = join(FIXTURES_DIR, GOLDEN_FILES[kind]);
  writeFileSync(path, canonicalize(golden));
  console.log(`wrote ${path}`);
}

async function main(): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  await record("task-view", ["task", "view", TASK_VIEW_ID, "--json"], undefined);
  await record("task-list", ["task", "list", "--json"], "tasks");
  await record("search", ["search", SEARCH_QUERY, "--json"], "results");
}

await main();
