/** Contained, symlink-safe storage for explicitly retained projection snapshots. */

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { LoreError } from "../errors";
import { digestHex } from "./ladybug-source";
import {
  parseRetainedSnapshot,
  type RetainedScopeKind,
  type RetainedSnapshot,
  type RetainedSnapshotDescriptor,
  SNAPSHOT_RETENTION_LIMIT,
  serializeRetainedSnapshot,
  snapshotDescriptor,
} from "./snapshot";

export const SNAPSHOT_CACHE_REL_ROOT = ".lore/cache/snapshots/1" as const;

export interface SnapshotScopeSelection {
  readonly kind: RetainedScopeKind;
  readonly scopeKey: string;
}

export interface RetainSnapshotResult {
  readonly action: "retained" | "unchanged";
  readonly snapshot: RetainedSnapshotDescriptor;
  readonly retained: number;
  readonly maximum: typeof SNAPSHOT_RETENTION_LIMIT;
}

export interface DeleteSnapshotResult {
  readonly scope: SnapshotScopeSelection;
  readonly deleted: readonly string[];
}

export function retainSnapshot(root: string, snapshot: RetainedSnapshot): RetainSnapshotResult {
  const canonicalRoot = canonicalRepositoryRoot(root);
  const normalized = parseRetainedSnapshot(snapshot);
  const selection = { kind: normalized.scopeKind, scopeKey: normalized.scopeKey } as const;
  const scopeRoot = scopePath(canonicalRoot, selection);
  ensureScopeLayout(canonicalRoot, selection);
  const existing = listSnapshots(canonicalRoot, selection);
  const same = existing.find((candidate) => candidate.snapshotKey === normalized.snapshotKey);
  if (same !== undefined) {
    const loaded = loadSnapshot(canonicalRoot, selection, normalized.snapshotKey);
    if (serializeRetainedSnapshot(loaded) !== serializeRetainedSnapshot(normalized)) {
      throw new LoreError(
        "validation",
        "retained snapshot key refers to different bytes",
        "delete the corrupt retained snapshot explicitly before retrying",
      );
    }
    return {
      action: "unchanged",
      snapshot: snapshotDescriptor(loaded),
      retained: existing.length,
      maximum: SNAPSHOT_RETENTION_LIMIT,
    };
  }
  if (existing.length >= SNAPSHOT_RETENTION_LIMIT) {
    throw new LoreError(
      "conflict",
      `retained snapshot limit ${SNAPSHOT_RETENTION_LIMIT} reached for this scope`,
      "delete an explicit retained snapshot before retaining another; Lore never evicts history silently",
    );
  }
  const path = snapshotPath(scopeRoot, normalized.snapshotKey);
  const temporary = join(scopeRoot, `.retaining-${randomBytes(16).toString("hex")}`);
  try {
    writeFileSync(temporary, serializeRetainedSnapshot(normalized), { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
    chmodSync(path, 0o400);
  } catch (cause) {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
    throw mapStoreFailure(cause, "retain snapshot");
  }
  return {
    action: "retained",
    snapshot: snapshotDescriptor(normalized),
    retained: existing.length + 1,
    maximum: SNAPSHOT_RETENTION_LIMIT,
  };
}

export function listSnapshots(root: string, selection: SnapshotScopeSelection): RetainedSnapshotDescriptor[] {
  const canonicalRoot = canonicalRepositoryRoot(root);
  const path = scopePath(canonicalRoot, selection);
  if (!existsSync(path)) return [];
  assertRealDirectory(path, canonicalRoot);
  const entries = readdirSync(path, { withFileTypes: true });
  const snapshots: RetainedSnapshotDescriptor[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !/^[0-9a-f]{64}\.json$/u.test(entry.name)) {
      throw new LoreError(
        "denied",
        `unexpected retained snapshot entry ${entry.name}`,
        "remove it manually after verifying the exact contained path",
      );
    }
    const snapshotKey = `sha256:${entry.name.slice(0, -5)}`;
    snapshots.push(snapshotDescriptor(loadSnapshot(canonicalRoot, selection, snapshotKey)));
  }
  return snapshots.sort((a, b) => compare(a.snapshotKey, b.snapshotKey));
}

export function loadSnapshot(root: string, selection: SnapshotScopeSelection, selector: string): RetainedSnapshot {
  const canonicalRoot = canonicalRepositoryRoot(root);
  const descriptors = listSnapshotFiles(canonicalRoot, selection);
  const exactKey = normalizeSnapshotKey(selector);
  const candidates =
    exactKey !== null
      ? descriptors.filter((descriptor) => descriptor.snapshotKey === exactKey)
      : descriptors.filter((descriptor) =>
          descriptor.repositories.some((repository) => repository.gitCommit === selector),
        );
  if (candidates.length === 0)
    throw new LoreError("not_found", `retained snapshot ${JSON.stringify(selector)} was not found`);
  if (candidates.length > 1) {
    throw new LoreError(
      "conflict",
      `retained commit selector ${JSON.stringify(selector)} is ambiguous`,
      "use the exact snapshot key",
    );
  }
  const selected = candidates[0] as RetainedSnapshotDescriptor;
  const path = snapshotPath(scopePath(canonicalRoot, selection), selected.snapshotKey);
  let value: unknown;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new LoreError("denied", "retained snapshot must be a real regular file");
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    if (cause instanceof LoreError) throw cause;
    throw mapStoreFailure(cause, "read retained snapshot");
  }
  const snapshot = parseRetainedSnapshot(value);
  if (
    snapshot.scopeKind !== selection.kind ||
    snapshot.scopeKey !== selection.scopeKey ||
    snapshot.snapshotKey !== selected.snapshotKey
  ) {
    throw new LoreError("validation", "retained snapshot path and embedded identity disagree");
  }
  return snapshot;
}

export function deleteSnapshots(
  root: string,
  selection: SnapshotScopeSelection,
  options: { readonly snapshotKey?: string; readonly all?: boolean },
): DeleteSnapshotResult {
  if ((options.snapshotKey === undefined) === (options.all !== true)) {
    throw new LoreError("usage", "snapshot deletion needs exactly one snapshot key or --all");
  }
  const canonicalRoot = canonicalRepositoryRoot(root);
  const scopeRoot = scopePath(canonicalRoot, selection);
  const retained = listSnapshots(canonicalRoot, selection);
  if (!existsSync(scopeRoot)) return { scope: selection, deleted: [] };
  const targets =
    options.all === true
      ? retained.map((snapshot) => snapshot.snapshotKey)
      : retained
          .filter((snapshot) => snapshot.snapshotKey === normalizeSnapshotKey(options.snapshotKey as string))
          .map((snapshot) => snapshot.snapshotKey);
  if (options.all !== true && targets.length === 0) {
    throw new LoreError("not_found", `retained snapshot ${JSON.stringify(options.snapshotKey)} was not found`);
  }
  for (const snapshotKey of targets) {
    const path = snapshotPath(scopeRoot, snapshotKey);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new LoreError("denied", "refusing to delete a non-file retained snapshot entry");
    rmSync(path, { force: false });
  }
  if (options.all === true && readdirSync(scopeRoot).length === 0) rmdirSync(scopeRoot);
  return { scope: selection, deleted: targets.sort(compare) };
}

function listSnapshotFiles(root: string, selection: SnapshotScopeSelection): RetainedSnapshotDescriptor[] {
  const scopeRoot = scopePath(root, selection);
  if (!existsSync(scopeRoot)) return [];
  assertRealDirectory(scopeRoot, root);
  return readdirSync(scopeRoot, { withFileTypes: true })
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[0-9a-f]{64}\.json$/u.test(entry.name)) {
        throw new LoreError("denied", `unexpected retained snapshot entry ${entry.name}`);
      }
      const snapshotKey = `sha256:${entry.name.slice(0, -5)}`;
      const path = join(scopeRoot, entry.name);
      let value: unknown;
      try {
        value = JSON.parse(readFileSync(path, "utf8"));
      } catch (cause) {
        throw mapStoreFailure(cause, "read retained snapshot catalog");
      }
      const snapshot = parseRetainedSnapshot(value);
      if (
        snapshot.scopeKind !== selection.kind ||
        snapshot.scopeKey !== selection.scopeKey ||
        snapshot.snapshotKey !== snapshotKey
      ) {
        throw new LoreError("validation", "retained snapshot catalog identity disagrees with its contained path");
      }
      return snapshotDescriptor(snapshot);
    })
    .sort((a, b) => compare(a.snapshotKey, b.snapshotKey));
}

function ensureScopeLayout(root: string, selection: SnapshotScopeSelection): void {
  const rel = `${SNAPSHOT_CACHE_REL_ROOT}/${selection.kind}/${digestHex(selection.scopeKey)}`;
  let current = root;
  for (const segment of rel.split("/")) {
    current = join(current, segment);
    assertContained(root, current);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    assertRealDirectory(current, root);
  }
}

function scopePath(root: string, selection: SnapshotScopeSelection): string {
  const path = join(root, SNAPSHOT_CACHE_REL_ROOT, selection.kind, digestHex(selection.scopeKey));
  assertContained(root, path);
  return path;
}

function snapshotPath(scopeRoot: string, snapshotKey: string): string {
  return join(scopeRoot, `${digestHex(snapshotKey)}.json`);
}

function normalizeSnapshotKey(value: string): string | null {
  try {
    return `sha256:${digestHex(value)}`;
  } catch {
    return null;
  }
}

function assertRealDirectory(path: string, root: string): void {
  assertContained(root, path);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new LoreError(
      "denied",
      `refusing retained snapshot path through non-directory or symlink ${relative(root, path)}`,
    );
  }
}

function assertContained(root: string, path: string): void {
  const rel = relative(root, path);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  throw new LoreError("denied", "retained snapshot path escapes the repository");
}

function canonicalRepositoryRoot(root: string): string {
  const resolved = resolve(root);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new LoreError("denied", "repository root must be a real directory");
  return resolved;
}

function mapStoreFailure(cause: unknown, action: string): LoreError {
  if (cause instanceof LoreError) return cause;
  const code = (cause as NodeJS.ErrnoException).code;
  if (code === "EACCES" || code === "EPERM") return new LoreError("denied", `cannot ${action}`);
  if (code === "ENOENT") return new LoreError("not_found", `cannot ${action}`);
  if (code === "EEXIST") return new LoreError("conflict", `cannot ${action}: target already exists`);
  return new LoreError("validation", `cannot ${action}`, cause instanceof Error ? cause.message : undefined);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
