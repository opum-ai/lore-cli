/**
 * backlog-golden.ts — test-only support for the Backlog.md `--json` **golden contract**
 * (LORE-13 AC#2; migrated to upstream's `--json` contract by LORE-54).
 *
 * This module is the single source the golden test and the golden *recorder*
 * (`record-backlog-goldens.ts`) share, so a committed golden and a freshly recorded one
 * are produced by exactly the same normalization. It has two jobs:
 *
 * 1. **Canonicalization** — turn an upstream `--json` envelope into the exact bytes committed
 *    under `test/fixtures/backlog-json/`. Unlike the fork's shape, upstream's envelope carries no
 *    host-specific field to redact: `task-view`'s `path` is already project-relative
 *    (backlog-json-schema.md §6), so {@link canonicalize} only needs to pretty-print to a stable
 *    2-space form with a single trailing newline. `canonicalize` is a fixpoint:
 *    `canonicalize(JSON.parse(canonicalize(x)))` is byte-identical to `canonicalize(x)` (the AC#2
 *    idempotency check).
 *
 * 2. **The contract mirror** — the Zod schema mirroring the normative
 *    [Backlog.md `--json` schema](../../docs/reference/backlog-json-schema.md) (the schema of
 *    record). The golden test parses each committed golden and validates it against this mirror,
 *    "locking" the recorded output to the documented contract: a drift in either upstream's shape
 *    or the doc surfaces as a failing test. Unknown keys are tolerated (`z.looseObject`) per the
 *    additive-only contract; missing required keys are rejected.
 *
 * As of **LORE-21** (and re-confirmed by LORE-54's rewrite) the mirror is the *runtime adapter's own*
 * schema of record — it lives in `src/adapters/backlog.ts` (the typed read path). This module
 * **re-exports** those schemas so the golden test and the recorder keep a single import site while
 * validating against exactly the same shapes the adapter parses at runtime — there is no second copy.
 */

export type { EnvelopeKind } from "../../src/adapters/backlog";
// The contract mirror is owned by the runtime adapter (LORE-21/LORE-54); re-export it so golden
// fixtures are validated against the very shapes the adapter parses. Canonicalization below stays
// test-only.
export {
  EnvelopeSchema,
  SearchHitSchema,
  TaskSchema,
  TaskSummarySchema,
} from "../../src/adapters/backlog";

/**
 * The canonical byte form of a golden: 2-space pretty-printed JSON with exactly one trailing
 * newline. Deterministic — `JSON.stringify` preserves the source key order, and upstream emits a
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
