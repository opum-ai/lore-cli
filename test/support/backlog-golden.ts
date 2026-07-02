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
 * 2. **The contract mirror** — the Zod schema mirroring the normative
 *    [Backlog.md `--json` schema](../../docs/reference/backlog-json-schema.md) (the schema of
 *    record). The golden test parses each committed golden and validates it against this mirror,
 *    "locking" the recorded output to the documented contract: a drift in either the fork's shape
 *    or the doc surfaces as a failing test. Unknown keys are tolerated (`z.looseObject`) per the
 *    additive-only contract (§2); missing required keys are rejected.
 *
 * As of **LORE-21** the mirror is the *runtime adapter's own* schema of record — it lives in
 * `src/adapters/backlog.ts` (the typed read path). This module **re-exports** those schemas so the
 * golden test and the recorder keep a single import site while validating against exactly the same
 * shapes the adapter parses at runtime — there is no second copy.
 */

export type { EnvelopeKind } from "../../src/adapters/backlog";
// The contract mirror is owned by the runtime adapter (LORE-21); re-export it so golden fixtures are
// validated against the very shapes the adapter parses. Canonicalization/redaction below stay test-only.
export {
  EnvelopeSchema,
  SearchHitSchema,
  TaskSchema,
  TaskSummarySchema,
} from "../../src/adapters/backlog";

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
