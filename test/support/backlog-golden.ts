/**
 * backlog-golden.ts — test-only support for the Backlog.md `--json` **golden contract**
 * (LORE-13 AC#2).
 *
 * This module is the single source the golden test and the golden *recorder*
 * (`record-backlog-goldens.ts`) share, so a committed golden and a freshly recorded one
 * are produced by exactly the same normalization. It has two jobs:
 *
 * 1. **Canonicalization + redaction** — turn a fork `--json` envelope into the exact bytes
 *    committed under `test/fixtures/backlog-json/`. The only host-specific field in the
 *    envelope is the **absolute** `filePath` (backlog-json-schema.md §6 "filePath is absolute
 *    and host-specific"); {@link redactRepoRoot} rewrites the checkout root to {@link REPO_PLACEHOLDER}
 *    so the golden is portable and {@link canonicalize} pretty-prints it to a stable 2-space
 *    form with a single trailing newline. Together they make golden generation a **fixpoint**:
 *    `canonicalize(redact(x))` fed through again is byte-identical (the AC#2 idempotency check).
 *
 * 2. **The contract mirror** — a Zod schema mirroring the normative
 *    [Backlog.md `--json` schema](../../docs/reference/backlog-json-schema.md) (the schema of
 *    record). The golden test parses each committed golden and validates it against this mirror,
 *    "locking" the recorded output to the documented contract: a drift in either the fork's shape
 *    or the doc surfaces as a failing test. Unknown keys are tolerated ({@link z.looseObject}) per
 *    the additive-only contract (§2); missing required keys are rejected.
 *
 * The mirror lives in `test/` deliberately: the runtime adapter's own Zod validation of this
 * same shape is **LORE-21** (`src/adapters/backlog.ts`, the typed read path). When that lands it
 * becomes the schema of record in code, and this mirror should be retargeted to import it rather
 * than duplicate it. Until then, this is the only machine-checked encoding of §3–§5.
 */

import { z } from "zod";

/** The token an absolute checkout root is rewritten to in a committed golden, keeping it portable. */
export const REPO_PLACEHOLDER = "{REPO}";

/**
 * Deep-rewrite every occurrence of `repoRoot` (an absolute checkout path) to {@link REPO_PLACEHOLDER}
 * in all string values of `value`, returning a new structure (input untouched). This is what makes a
 * golden captured on one machine byte-identical to one captured on another: `filePath` is the only
 * absolute, host-specific field in the envelope (backlog-json-schema.md §6). `filePathRelative` and
 * every other field are already portable and pass through unchanged.
 */
export function redactRepoRoot(value: unknown, repoRoot: string): unknown {
  if (typeof value === "string") {
    return value.split(repoRoot).join(REPO_PLACEHOLDER);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactRepoRoot(item, repoRoot));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = redactRepoRoot(val, repoRoot);
    }
    return out;
  }
  return value;
}

/**
 * The canonical byte form of a golden: 2-space pretty-printed JSON with exactly one trailing
 * newline. Deterministic — `JSON.stringify` preserves the source key order, and the fork emits a
 * stable key order — so `canonicalize` is a fixpoint: `canonicalize(JSON.parse(canonicalize(x)))`
 * equals `canonicalize(x)` byte-for-byte. The golden test asserts each committed file already
 * equals its own re-canonicalization (AC#2: "re-generate == byte-identical").
 */
export function canonicalize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Parse committed golden text and re-canonicalize it — the operation whose fixpoint the idempotency
 * test checks. A hand-edit that leaves a golden in non-canonical form (wrong indent, trailing
 * whitespace, reordered by a formatter) makes `recanonicalize(text) !== text` and fails the test.
 */
export function recanonicalize(text: string): string {
  return canonicalize(JSON.parse(text) as unknown);
}

// ── The contract mirror (docs/reference/backlog-json-schema.md §1–§5) ───────────────

/** Priority is a closed set or null (§3.2). */
const Priority = z.enum(["high", "medium", "low"]).nullable();

/** Provenance is a closed set or null (§3.2 `source`). */
const Source = z.enum(["local", "remote", "completed", "local-branch"]).nullable();

/** An acceptance-criterion / definition-of-done item; `index` is positional and NON-durable (§6). */
const Criterion = z.looseObject({
  index: z.number(),
  text: z.string(),
  checked: z.boolean(),
});

/** A task comment (§3.1); `author` may be null. */
const Comment = z.looseObject({
  index: z.number(),
  author: z.string().nullable(),
  createdDate: z.string(),
  body: z.string(),
});

/**
 * `kind: "task"` — the full task object (§3.2), the richest shape. `looseObject` tolerates unknown
 * additive keys (§2). `rawContent` (opt-in, §6) and `lastModified` (omitted/normalized, §2) are
 * deliberately NOT declared here; the golden test asserts they are absent from the recorded output.
 */
export const TaskSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: Priority,
  ordinal: z.number().nullable(),
  filePath: z.string().nullable(),
  filePathRelative: z.string().nullable(),
  assignees: z.array(z.string()),
  reporter: z.string().nullable(),
  createdDate: z.string(),
  updatedDate: z.string().nullable(),
  labels: z.array(z.string()),
  milestone: z.string().nullable(),
  dependencies: z.array(z.string()),
  references: z.array(z.string()),
  documentation: z.array(z.string()),
  modifiedFiles: z.array(z.string()),
  parentTaskId: z.string().nullable(),
  // View-only enrichment (§6): present on `task view`, optional/absent on list/search.
  parentTaskTitle: z.string().nullable().optional(),
  subtasks: z.array(z.looseObject({ id: z.string(), title: z.string() })).optional(),
  acceptanceCriteria: z.array(Criterion),
  definitionOfDone: z.array(Criterion),
  description: z.string().nullable(),
  implementationPlan: z.string().nullable(),
  implementationNotes: z.string().nullable(),
  finalSummary: z.string().nullable(),
  comments: z.array(Comment),
  source: Source,
  branch: z.string().nullable(),
  onStatusChange: z.union([z.record(z.string(), z.unknown()), z.string()]).nullable(),
});

/**
 * A `taskList` entry / `searchResult` task item — the stable summary subset (§4). Field-compatible
 * with {@link TaskSchema} on its shared keys, per the fork's `serializeTaskSummary` contract.
 */
export const TaskSummarySchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: Priority,
  ordinal: z.number().nullable(),
  assignees: z.array(z.string()),
  labels: z.array(z.string()),
  milestone: z.string().nullable(),
  parentTaskId: z.string().nullable(),
  filePath: z.string().nullable(),
  filePathRelative: z.string().nullable(),
});

/** One scored search hit (§5): a `type`-tagged, `score`d wrapper around the matched `item`. */
export const SearchHitSchema = z.looseObject({
  type: z.enum(["task", "document", "decision"]),
  score: z.number().nullable(),
  // `item` shape depends on `type`; `lore` only consumes task hits (§5). Task items must match the
  // summary subset; document/decision items are Backlog-owned and only shape-checked loosely.
  item: z.looseObject({}),
});

/** The per-`kind` envelope (§1): exactly one object, `schemaVersion` "1", camelCase `kind`, typed `data`. */
export const EnvelopeSchema = z.discriminatedUnion("kind", [
  z.looseObject({ schemaVersion: z.literal("1"), kind: z.literal("task"), data: TaskSchema }),
  z.looseObject({ schemaVersion: z.literal("1"), kind: z.literal("taskList"), data: z.array(TaskSummarySchema) }),
  z.looseObject({ schemaVersion: z.literal("1"), kind: z.literal("searchResult"), data: z.array(SearchHitSchema) }),
]);

/** The three envelope kinds a golden file can carry, in the fork's camelCase spelling. */
export type EnvelopeKind = "task" | "taskList" | "searchResult";
