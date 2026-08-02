/** `lore explorer [--out <file>] [--force]` — deterministic offline graph artifact generation. */

import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import {
  buildExplorerSnapshot,
  EXPLORER_ARTIFACT_VERSION,
  explorerArtifactDigest,
  renderExplorerArtifact,
} from "../core/explorer";
import type { ExplorerSnapshot } from "../core/explorer-contract";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "../core/ladybug-native";
import { loadLadybugProjectionSource } from "../core/ladybug-source";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { assertFlagAtMostOnce, parseCommandArgs, singleOptionValue, usage } from "./args";
import { assertNoSymlinkInPath, classifyExistingFile, ensureDir, writeFileAtomic } from "./fswrite";

export const DEFAULT_EXPLORER_ARTIFACT_PATH = ".lore/explorer/index.html";

export interface ExplorerCommandOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
  readonly stderr?: Writer;
  readonly adapter?: BacklogAdapter;
  readonly loadSnapshot?: ExplorerSnapshotLoader;
}

export interface ExplorerSnapshotLoaderOptions {
  readonly root: string;
  readonly adapter?: BacklogAdapter;
  readonly warnings: WarningCollector;
}

export type ExplorerSnapshotLoader = (options: ExplorerSnapshotLoaderOptions) => Promise<ExplorerSnapshot>;

export interface ExplorerArtifactResult {
  readonly artifactVersion: typeof EXPLORER_ARTIFACT_VERSION;
  readonly snapshotSchemaVersion: string;
  readonly snapshotKey: string;
  readonly path: string;
  readonly action: "created" | "updated" | "unchanged";
  readonly byteLength: number;
  readonly digest: string;
  readonly counts: ExplorerSnapshot["health"]["counts"];
}

interface ExplorerArgs {
  readonly out: string;
  readonly customOut: boolean;
  readonly force: boolean;
}

export async function runExplorer(options: ExplorerCommandOptions): Promise<number> {
  const parsed = parseExplorerArgs(options.args);
  const target = confineArtifactPath(parsed.out, options.root);
  const warnings = new WarningCollector();
  const snapshot = await (options.loadSnapshot ?? loadProductionSnapshot)({
    root: options.root,
    adapter: options.adapter,
    warnings,
  });
  warnings.flush({ color: options.output.color, stderr: options.stderr });
  const html = renderExplorerArtifact(snapshot);
  assertNoSymlinkInPath(options.root, target.relPath);
  const existing = classifyExistingFile(target.absPath, html);
  if (parsed.customOut && existing === "differs" && !parsed.force) {
    throw new LoreError(
      "conflict",
      `cannot overwrite differing explorer artifact ${target.relPath}`,
      "pass --force to replace it, choose another --out path, or remove the existing file",
      { path: target.relPath },
    );
  }
  const action = existing === "missing" ? "created" : existing === "unchanged" ? "unchanged" : "updated";
  if (action !== "unchanged") {
    const parent = dirname(target.relPath);
    if (parent !== ".") ensureDir(options.root, parent);
    writeFileAtomic(target.absPath, html, target.relPath);
  }
  const data: ExplorerArtifactResult = {
    artifactVersion: EXPLORER_ARTIFACT_VERSION,
    snapshotSchemaVersion: snapshot.schemaVersion,
    snapshotKey: snapshot.source.snapshotKey,
    path: target.relPath,
    action,
    byteLength: Buffer.byteLength(html),
    digest: explorerArtifactDigest(html),
    counts: snapshot.health.counts,
  };
  emit(explorerRenderable(data), options.output, options.stdout);
  return EXIT_OK;
}

async function loadProductionSnapshot(options: ExplorerSnapshotLoaderOptions): Promise<ExplorerSnapshot> {
  const source = await loadLadybugProjectionSource({
    root: options.root,
    ladybugVersion: EXPECTED_LADYBUG_VERSION,
    ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    adapter: options.adapter,
    warnings: options.warnings,
  });
  return buildExplorerSnapshot(source);
}

function parseExplorerArgs(args: readonly string[]): ExplorerArgs {
  const parsed = parseCommandArgs(args, "explorer");
  assertFlagAtMostOnce(parsed, "out");
  assertFlagAtMostOnce(parsed, "force");
  if (parsed.positionals.length > 0) {
    throw usage(`unexpected argument "${parsed.positionals[0]}"`, "run `lore explorer [--out <file>] [--force]`");
  }
  const out = singleOptionValue(parsed, "out");
  if (out === "") throw usage("--out needs a value", "pass a repository-relative .html file path");
  return { out: out ?? DEFAULT_EXPLORER_ARTIFACT_PATH, customOut: out !== undefined, force: parsed.flags.has("force") };
}

function confineArtifactPath(path: string, root: string): { readonly absPath: string; readonly relPath: string } {
  const absPath = resolve(root, path);
  const rel = relative(root, absPath);
  if (isAbsolute(path) || rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw usage(`--out path "${path}" must name a file inside the repo`, "give --out a repo-relative .html file path");
  }
  const relPath = rel.split(sep).join("/");
  const first = relPath.split("/")[0]?.toLowerCase();
  if (first === "docs" || first === "backlog" || first === ".git") {
    throw usage(
      `--out path "${path}" targets protected repository source`,
      "write the derived artifact outside docs/, backlog/, and .git/, e.g. .lore/explorer/index.html",
    );
  }
  if (!relPath.toLowerCase().endsWith(".html")) {
    throw usage(`--out path "${path}" must end in .html`, "pass a self-contained HTML artifact path");
  }
  return { absPath, relPath };
}

function explorerRenderable(data: ExplorerArtifactResult): Renderable<ExplorerArtifactResult> {
  return { kind: "explorer.artifact", data, pretty: renderText, plain: renderText };
}

function renderText(data: ExplorerArtifactResult): string {
  return [
    `${data.action} ${data.path} (${data.byteLength} bytes, ${data.artifactVersion})`,
    `snapshot ${data.snapshotKey}: ${data.counts.concepts} concepts, ${data.counts.tasks} tasks, ${data.counts.authoredEdges} edges`,
  ].join("\n");
}
