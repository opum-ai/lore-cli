/**
 * record-backlog-goldens.ts — regenerate the committed Backlog.md `--json` golden fixtures
 * (LORE-13 AC#2; migrated to upstream's contract by LORE-54; migrated off the interim
 * pinned-commit build to the published `backlog.md` package by LCLI-253). Run manually when
 * upstream's serializer or the JSON contract changes:
 *
 * ```sh
 * # Point at an installed `backlog` binary at or past v1.49.0 (the first tagged MrLesk/Backlog.md
 * # release containing PR #790 / BACK-545) -- `npm install -g backlog.md@<version>` puts one on
 * # PATH. LORE_BACKLOG_CLI defaults to "backlog" resolved via PATH, so it only needs setting to
 * # point at a different binary.
 * bun test/support/record-backlog-goldens.ts
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
 *
 * Two guards run BEFORE any golden is written to disk (LORE-106 — a Codex-review follow-up on this
 * script trusting inputs it never verified):
 *
 * 1. **Version pin** ({@link assertBacklogVersionPinned}) — `LORE_BACKLOG_CLI` is an arbitrary,
 *    env-overridable binary path with no default check that it actually reports the version
 *    `docker/e2e/Dockerfile` pins (`BACKLOG_VERSION`). Regenerating against an unpinned/mismatched
 *    version would silently bake an unreviewed upstream change into the committed goldens.
 * 2. **Specimen shape** ({@link assertTaskViewSpecimenShape}) — `TASK_VIEW_ID` defaults to `LORE-33`,
 *    a real, mutable task in this repo's own `backlog/`. If its fields ever drift for reasons
 *    unrelated to the upstream contract, a golden-regeneration run would bake that drift into
 *    `task-view.json` and misattribute it to an upstream change. This re-checks the specimen still
 *    has the documented shape (Done, plan, notes, exactly two acceptance criteria, at least one
 *    dependency, at least one documentation link, null `finalSummary`) before trusting it.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** The `backlog` binary to record goldens against — overridable; defaults to whatever `backlog` resolves to on PATH. */
const BACKLOG_CLI = process.env.LORE_BACKLOG_CLI ?? "backlog";

/** Where the committed goldens live, resolved relative to this script. */
const FIXTURES_DIR = join(import.meta.dir, "..", "fixtures", "backlog-json");

/** The Dockerfile that pins the backlog version goldens must be regenerated against (read-only — never written by this script). */
const DOCKERFILE_PATH = join(import.meta.dir, "..", "..", "docker", "e2e", "Dockerfile");

/** The file each kind is written to, matching upstream's own hyphenated `kind` spelling. */
const GOLDEN_FILES: Record<EnvelopeKind, string> = {
  "task-view": "task-view.json",
  "task-list": "task-list.json",
  search: "search.json",
};

/** Run the upstream CLI with `args`, returning parsed stdout JSON or throwing with captured stderr. */
async function upstreamJson(args: readonly string[]): Promise<Record<string, unknown>> {
  const proc = Bun.spawn([BACKLOG_CLI, ...args], { stdout: "pipe", stderr: "pipe" });
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

/**
 * Extract the pinned `BACKLOG_VERSION` from a `docker/e2e/Dockerfile`-shaped file's
 * `ARG BACKLOG_VERSION=<semver>` line. `dockerfilePath` is a parameter (not a bare closure over
 * {@link DOCKERFILE_PATH}) so the malformed/missing-pin case is unit-testable against a fixture
 * file, without touching the real Dockerfile.
 */
export function readPinnedBacklogVersion(dockerfilePath: string): string {
  const text = readFileSync(dockerfilePath, "utf8");
  const match = text.match(/^ARG BACKLOG_VERSION=(\d+\.\d+\.\d+)$/m);
  if (match?.[1] === undefined) {
    throw new Error(
      `could not find a pinned version in ${dockerfilePath} (expected a line matching ` +
        "`ARG BACKLOG_VERSION=<major.minor.patch>`)",
    );
  }
  return match[1];
}

/**
 * Resolve the version `cliPath` reports (`<cliPath> --version`), throwing with the captured
 * stderr if the spawn itself fails or exits non-zero (e.g. `LORE_BACKLOG_CLI` pointing at a binary
 * missing from PATH).
 */
/** `Bun.spawnSync` itself throws (e.g. `ENOENT`) rather than returning a failed result when `cliPath` can't be spawned at all. */
function trySpawnVersion(cliPath: string) {
  try {
    return Bun.spawnSync([cliPath, "--version"], { stdout: "pipe", stderr: "pipe" });
  } catch (err) {
    throw new Error(`could not resolve ${cliPath}'s version: \`${cliPath} --version\` failed to spawn: ${err}`);
  }
}

export function resolveBacklogVersion(cliPath: string): string {
  const proc = trySpawnVersion(cliPath);
  if (proc.exitCode !== 0) {
    throw new Error(
      `could not resolve ${cliPath}'s version: \`${cliPath} --version\` exited ${proc.exitCode}: ${proc.stderr.toString("utf8").trim()}`,
    );
  }
  return proc.stdout.toString("utf8").trim();
}

/**
 * Pure comparison half of the version-pin guard (LORE-106 AC#1): throws a clear, actionable error
 * when `actual` (what `cliPath` really reports) doesn't match `pinned` (what
 * `docker/e2e/Dockerfile`'s `BACKLOG_VERSION` documents). Split from I/O so the guard's own
 * decision logic is directly unit-testable with fabricated versions.
 */
export function assertVersionPinned(actual: string, pinned: string, cliPath: string): void {
  if (actual !== pinned) {
    throw new Error(
      `LORE_BACKLOG_CLI (${cliPath}) reports version ${actual}, but docker/e2e/Dockerfile pins ` +
        `BACKLOG_VERSION=${pinned}. Install the pinned version before regenerating goldens against it ` +
        "(or update the Dockerfile's pin deliberately, as its own change).",
    );
  }
}

/** AC#1: abort — writing no golden — unless `LORE_BACKLOG_CLI` reports the Dockerfile-pinned version. */
function assertBacklogVersionPinned(): void {
  const pinned = readPinnedBacklogVersion(DOCKERFILE_PATH);
  const actual = resolveBacklogVersion(BACKLOG_CLI);
  assertVersionPinned(actual, pinned, BACKLOG_CLI);
}

/**
 * AC#2: validate that a fetched `task-view` envelope's `task` still matches the shape this
 * script's goldens document (see the {@link TASK_VIEW_ID} doc comment): `Done` status, a
 * non-empty plan, non-empty notes, exactly two acceptance criteria, at least one dependency, at
 * least one documentation link, and a **null** `finalSummary`. Throws — collecting every mismatch
 * rather than stopping at the first — instead of letting a drifted live task silently get baked
 * into the committed golden.
 */
export function assertTaskViewSpecimenShape(envelope: Record<string, unknown>, taskId: string): void {
  const task = envelope.task as Record<string, unknown> | undefined;
  if (task === undefined || task === null || typeof task !== "object") {
    throw new Error(
      `task-view specimen ${taskId}: envelope has no \`task\` object (got ${JSON.stringify(envelope.task)})`,
    );
  }
  const problems: string[] = [];
  if (task.status !== "Done") {
    problems.push(`status: expected "Done", got ${JSON.stringify(task.status)}`);
  }
  if (typeof task.implementationPlan !== "string" || task.implementationPlan.trim() === "") {
    problems.push("implementationPlan: expected a non-empty plan");
  }
  if (typeof task.implementationNotes !== "string" || task.implementationNotes.trim() === "") {
    problems.push("implementationNotes: expected non-empty notes");
  }
  const ac = task.acceptanceCriteria;
  if (!Array.isArray(ac) || ac.length !== 2) {
    problems.push(`acceptanceCriteria: expected exactly 2 entries, got ${Array.isArray(ac) ? ac.length : typeof ac}`);
  }
  const deps = task.dependencies;
  if (!Array.isArray(deps) || deps.length === 0) {
    problems.push("dependencies: expected at least one dependency");
  }
  const docs = task.documentation;
  if (!Array.isArray(docs) || docs.length === 0) {
    problems.push("documentation: expected at least one documentation link");
  }
  if (task.finalSummary !== null) {
    problems.push(`finalSummary: expected null, got ${JSON.stringify(task.finalSummary)}`);
  }
  if (problems.length > 0) {
    throw new Error(
      `task-view specimen ${taskId} no longer matches the documented golden shape (Done status, plan, ` +
        "notes, 2 acceptance criteria, dependencies, documentation, null finalSummary):\n" +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nPick a different LORE_GOLDEN_TASK_ID specimen, or update this shape check deliberately if the " +
        "documented contract itself changed.",
    );
  }
}

/** Capture one kind, trim + canonicalize, and write its golden file. `validate`, when given, runs on the raw envelope BEFORE anything is written. */
async function record(
  kind: EnvelopeKind,
  args: readonly string[],
  arrayKey: "tasks" | "results" | undefined,
  validate?: (raw: Record<string, unknown>) => void,
): Promise<void> {
  const raw = await upstreamJson(args);
  validate?.(raw);
  const golden = trimSample(raw, arrayKey);
  const path = join(FIXTURES_DIR, GOLDEN_FILES[kind]);
  writeFileSync(path, canonicalize(golden));
  console.log(`wrote ${path}`);
}

async function main(): Promise<void> {
  // Guard FIRST, before any golden (or even the fixtures directory) is touched.
  assertBacklogVersionPinned();
  mkdirSync(FIXTURES_DIR, { recursive: true });
  await record("task-view", ["task", "view", TASK_VIEW_ID, "--json"], undefined, (raw) =>
    assertTaskViewSpecimenShape(raw, TASK_VIEW_ID),
  );
  await record("task-list", ["task", "list", "--json"], "tasks");
  await record("search", ["search", SEARCH_QUERY, "--json"], "results");
}

// Only run the full regeneration when executed directly (`bun test/support/record-backlog-goldens.ts`),
// never when imported — the guard functions above are unit-tested by importing this module, and
// importing it must not shell an upstream CLI or touch the fixtures directory as a side effect.
if (import.meta.main) {
  await main();
}
