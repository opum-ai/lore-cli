/**
 * order.ts — the single total-order string comparator lore's byte-stable output rests on.
 *
 * A plain lexicographic compare on UTF-16 code units: **stable and locale-independent** (unlike
 * the default `Array.prototype.sort`, which sorts by locale and is engine-dependent), so every
 * sorted artifact — the bundle walk and graph order ([bundle.ts](./bundle.ts)), the per-folder
 * `log.md` ordering ([log.ts](./log.ts)) — is reproducible on any machine. Kept in one place so the
 * determinism primitive the regenerate-and-compare invariant depends on can never be spelled two
 * different ways (or fixed in one path but not the other).
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
