/**
 * order.ts — the single total-order string comparator lore's byte-stable output rests on.
 *
 * A plain lexicographic compare on UTF-16 code units, so every sorted artifact — the bundle walk
 * and graph order ([bundle.ts](./bundle.ts)), the per-folder `log.md` ordering ([log.ts](./log.ts))
 * — is reproducible on any machine. Per ECMA-262, `Array.prototype.sort` with no comparator already
 * does this (UTF-16 code-unit order after ToString, stable since ES2019); this named comparator
 * exists as the single source of truth for that ordering so every call site spells it the same
 * explicit way and none can drift into an accidentally locale-aware compare (e.g. `localeCompare`).
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
