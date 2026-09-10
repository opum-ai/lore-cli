/**
 * commands/concurrency.ts — {@link mapWithConcurrency}, a tiny worker-pool over a shared cursor,
 * plus {@link TASK_DETAILS_CONCURRENCY}, the shared cap it bounds Backlog `viewTask` fan-out to.
 *
 * Pure and dependency-free (no import of any other `commands/` module) so it can be shared by
 * `commands/link.ts` and `commands/reconcile-shared.ts` without either importing the other:
 * `reconcile-shared.ts` already imports `verifiedViewTask`/`dedupeTaskIds`/`defaultAdapter` FROM
 * `link.ts`, so `link.ts` importing anything back from `reconcile-shared.ts` would create a
 * `link -> reconcile-shared -> link` cycle (LORE-233). Originally lived solely in
 * `reconcile-shared.ts` (LORE-111, bounding `resolveTaskDetails`'s fan-out and `check.ts`'s
 * `probeLiveness`); relocated here so `link.ts`'s own up-front task-existence-check fan-out
 * (`runLink`) could reuse the identical helper and cap instead of duplicating either.
 * `reconcile-shared.ts` re-exports both so its own existing importers (`check.ts`,
 * `reconcile-shared.test.ts`) keep working unchanged.
 */

/**
 * How many `adapter.viewTask` calls a caller runs at once — bounded so a large task-id fan-out
 * (a bundle linking many distinct ids, or a multi-id `lore link`) does not spawn one Backlog CLI
 * subprocess per id fully concurrently (which can exhaust process/file-descriptor limits or
 * overwhelm the Backlog CLI). Mirrors `check.ts`'s own `LIVENESS_CONCURRENCY` cap on external-URL
 * liveness probes — same shape of problem (unbounded subprocess/socket fan-out), same fix.
 * Exported so tests can assert against the real cap rather than duplicating (and risking drift
 * from) a hardcoded copy.
 */
export const TASK_DETAILS_CONCURRENCY = 8;

/**
 * Run `fn` over `items` with at most `limit` in flight at once — a tiny worker-pool over a shared
 * cursor. Shared by `reconcile-shared.ts`'s `resolveTaskDetails` (bounding concurrent
 * `adapter.viewTask` Backlog subprocess spawns), `check.ts`'s `probeLiveness` (bounding concurrent
 * external-URL fetches), and `link.ts`'s `runLink` (bounding its own up-front `verifiedViewTask`
 * existence-check fan-out).
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor++] as T;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
