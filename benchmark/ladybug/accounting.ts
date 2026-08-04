import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { LadybugProjectionSource } from "../../src/core/ladybug-source";
import { LADYBUG_CACHE_REL_ROOT } from "../../src/core/ladybug-source";

export interface BenchmarkSourceEntry {
  readonly path: string;
  readonly byteLength: number;
  readonly digest: string;
}

export interface BenchmarkSourceSnapshot {
  readonly digest: string;
  readonly byteLength: number;
  readonly entries: readonly BenchmarkSourceEntry[];
}

const SOURCE_ROOTS = ["docs", "backlog", ".git", ".lore"] as const;

/** Hash every repository-source byte while excluding only derived `.lore/cache` data. */
export function snapshotLadybugBenchmarkSources(rootInput: string): BenchmarkSourceSnapshot {
  const root = resolve(rootInput);
  const entries: BenchmarkSourceEntry[] = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    walkSource(root, join(root, sourceRoot), entries);
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash("sha256");
  let byteLength = 0;
  for (const entry of entries) {
    byteLength += entry.byteLength;
    hash.update(entry.path);
    hash.update("\0");
    hash.update(String(entry.byteLength));
    hash.update("\0");
    hash.update(entry.digest);
    hash.update("\n");
  }
  return { digest: `sha256:${hash.digest("hex")}`, byteLength, entries };
}

/** Hash the exact Ladybug cache tree for qualification evidence without exposing host paths. */
export function snapshotLadybugCache(rootInput: string): BenchmarkSourceSnapshot {
  const root = resolve(rootInput);
  const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
  const entries: BenchmarkSourceEntry[] = [];
  walkInventory(cacheRoot, cacheRoot, entries);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return summarizeEntries(entries);
}

/** Fail a benchmark sample if any docs, Backlog, Git, profile, or non-cache `.lore` byte changed. */
export function assertLadybugBenchmarkSourcesUnchanged(
  before: BenchmarkSourceSnapshot,
  after: BenchmarkSourceSnapshot,
): void {
  if (before.digest === after.digest) return;
  const beforeEntries = new Map(before.entries.map((entry) => [entry.path, entry]));
  const afterEntries = new Map(after.entries.map((entry) => [entry.path, entry]));
  const changed = [...new Set([...beforeEntries.keys(), ...afterEntries.keys()])]
    .filter((path) => beforeEntries.get(path)?.digest !== afterEntries.get(path)?.digest)
    .sort();
  throw new Error(`benchmark worker changed repository source bytes: ${changed.join(", ") || "inventory changed"}`);
}

/** Recursive logical file bytes below the exact Ladybug v1 cache root. */
export function ladybugCacheLogicalBytes(root: string): number {
  return logicalBytes(join(root, LADYBUG_CACHE_REL_ROOT));
}

/** Number of immutable, content-addressed generation directories currently present. */
export function ladybugGenerationCount(root: string): number {
  const generations = join(root, LADYBUG_CACHE_REL_ROOT, "generations");
  if (!existsSync(generations)) return 0;
  return readdirSync(generations, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && !entry.isSymbolicLink() && /^[0-9a-f]{64}$/.test(entry.name),
  ).length;
}

/** Canonical JSONL bytes supplied to the Ladybug projection. */
export function canonicalProjectionByteLength(source: LadybugProjectionSource): number {
  return Buffer.byteLength(`${source.records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

export function benchmarkDigest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function walkSource(root: string, path: string, entries: BenchmarkSourceEntry[]): void {
  if (!existsSync(path)) return;
  const relativePath = slash(relative(root, path));
  if (relativePath === ".lore/cache" || relativePath.startsWith(".lore/cache/")) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`benchmark source inventory refuses symlink ${relativePath}`);
  }
  if (stat.isDirectory()) {
    const children = readdirSync(path).sort();
    for (const child of children) walkSource(root, join(path, child), entries);
    return;
  }
  if (!stat.isFile()) throw new Error(`benchmark source inventory refuses non-file ${relativePath}`);
  const bytes = readFileSync(path);
  const finalStat = statSync(path);
  if (finalStat.size !== bytes.byteLength) {
    throw new Error(`benchmark source changed while hashing ${relativePath}`);
  }
  entries.push({ path: relativePath, byteLength: bytes.byteLength, digest: benchmarkDigest(bytes) });
}

function walkInventory(root: string, path: string, entries: BenchmarkSourceEntry[]): void {
  if (!existsSync(path)) return;
  const relativePath = slash(relative(root, path));
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`benchmark cache inventory refuses symlink ${relativePath}`);
  if (stat.isDirectory()) {
    for (const child of readdirSync(path).sort()) walkInventory(root, join(path, child), entries);
    return;
  }
  if (!stat.isFile()) throw new Error(`benchmark cache inventory refuses non-file ${relativePath}`);
  const bytes = readFileSync(path);
  const finalStat = statSync(path);
  if (finalStat.size !== bytes.byteLength) throw new Error(`benchmark cache changed while hashing ${relativePath}`);
  entries.push({ path: relativePath, byteLength: bytes.byteLength, digest: benchmarkDigest(bytes) });
}

function summarizeEntries(entries: readonly BenchmarkSourceEntry[]): BenchmarkSourceSnapshot {
  const hash = createHash("sha256");
  let byteLength = 0;
  for (const entry of entries) {
    byteLength += entry.byteLength;
    hash.update(entry.path);
    hash.update("\0");
    hash.update(String(entry.byteLength));
    hash.update("\0");
    hash.update(entry.digest);
    hash.update("\n");
  }
  return { digest: `sha256:${hash.digest("hex")}`, byteLength, entries: [...entries] };
}

function logicalBytes(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`benchmark cache accounting refuses symlink ${path}`);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) throw new Error(`benchmark cache accounting refuses non-file ${path}`);
  let total = 0;
  for (const child of readdirSync(path)) total += logicalBytes(join(path, child));
  return total;
}

function slash(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}
