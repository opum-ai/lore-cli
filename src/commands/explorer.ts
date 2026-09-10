/** `lore explorer [--out <file>] [--force]` — deterministic offline graph artifact generation. */

import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import {
  buildExplorerChangeSnapshot,
  buildExplorerSnapshot,
  EXPLORER_ARTIFACT_VERSION,
  explorerArtifactDigest,
  renderExplorerArtifact,
  renderExplorerChangeArtifact,
} from "../core/explorer";
import type { ExplorerSnapshot } from "../core/explorer-contract";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "../core/ladybug-native";
import { loadLadybugProjectionSource } from "../core/ladybug-source";
import type { RetainedSnapshot } from "../core/snapshot";
import { resolveSnapshotScope } from "../core/snapshot-runtime";
import { loadSnapshot as loadStoredSnapshot } from "../core/snapshot-store";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { assertFlagAtMostOnce, parseCommandArgs, singleOptionValue, usage, workspaceSelection } from "./args";
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
  readonly loadRetainedSnapshot?: (selector: string) => RetainedSnapshot | Promise<RetainedSnapshot>;
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
  readonly snapshot?: string;
  readonly from?: string;
  readonly to?: string;
  readonly workspace?: { readonly manifestPath: string; readonly memberIds: readonly string[] };
}

export async function runExplorer(options: ExplorerCommandOptions): Promise<number> {
  const parsed = parseExplorerArgs(options.args);
  const target = confineArtifactPath(parsed.out, options.root);
  const warnings = new WarningCollector();
  let html: string;
  let schemaVersion: string;
  let snapshotKey: string;
  let counts: ExplorerSnapshot["health"]["counts"];
  if (parsed.snapshot !== undefined || parsed.from !== undefined) {
    let scope: Awaited<ReturnType<typeof resolveSnapshotScope>> | undefined;
    const loadRetained = async (selector: string): Promise<RetainedSnapshot> => {
      if (options.loadRetainedSnapshot !== undefined) return options.loadRetainedSnapshot(selector);
      scope ??= await resolveSnapshotScope({
        root: options.root,
        selection: parsed.workspace === undefined ? {} : { workspace: parsed.workspace.manifestPath },
        warnings,
        adapter: options.adapter,
      });
      return loadStoredSnapshot(options.root, scope, selector);
    };
    const from = await loadRetained(parsed.snapshot ?? (parsed.from as string));
    const to = parsed.snapshot !== undefined ? from : await loadRetained(parsed.to as string);
    const retained = buildExplorerChangeSnapshot(from, to, {
      mode: parsed.snapshot !== undefined ? "snapshot" : "comparison",
      repositories: parsed.workspace?.memberIds ?? [],
    });
    html = renderExplorerChangeArtifact(retained);
    schemaVersion = retained.schemaVersion;
    snapshotKey = retained.to.snapshotKey;
    counts = retainedCounts(retained.to, parsed.workspace?.memberIds ?? []);
  } else {
    const snapshot = await (options.loadSnapshot ?? loadProductionSnapshot)({
      root: options.root,
      adapter: options.adapter,
      warnings,
    });
    html = renderExplorerArtifact(snapshot);
    schemaVersion = snapshot.schemaVersion;
    snapshotKey = snapshot.source.snapshotKey;
    counts = snapshot.health.counts;
  }
  warnings.flush({ color: options.output.color, stderr: options.stderr });
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
    snapshotSchemaVersion: schemaVersion,
    snapshotKey,
    path: target.relPath,
    action,
    byteLength: Buffer.byteLength(html),
    digest: explorerArtifactDigest(html),
    counts,
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
  const workspace = workspaceSelection(parsed);
  if (parsed.positionals.length > 0) {
    throw usage(`unexpected argument "${parsed.positionals[0]}"`, "run `lore explorer [--out <file>] [--force]`");
  }
  const out = singleOptionValue(parsed, "out");
  const snapshot = nonEmptySelector(singleOptionValue(parsed, "snapshot"), "snapshot");
  const from = nonEmptySelector(singleOptionValue(parsed, "from"), "from");
  const to = nonEmptySelector(singleOptionValue(parsed, "to"), "to");
  if (out === "") throw usage("--out needs a value", "pass a repository-relative .html file path");
  if (snapshot !== undefined && (from !== undefined || to !== undefined)) {
    throw usage(
      "--snapshot is mutually exclusive with --from and --to",
      "choose a retained snapshot view or a comparison",
    );
  }
  if ((from === undefined) !== (to === undefined)) {
    throw usage("--from and --to must be supplied together", "pass both retained snapshot selectors");
  }
  if (workspace !== undefined && snapshot === undefined && from === undefined) {
    throw usage("--workspace requires retained snapshot selectors", "pass --snapshot or both --from and --to");
  }
  return {
    out: out ?? DEFAULT_EXPLORER_ARTIFACT_PATH,
    customOut: out !== undefined,
    force: parsed.flags.has("force"),
    ...(snapshot !== undefined ? { snapshot } : {}),
    ...(from !== undefined ? { from, to: to as string } : {}),
    ...(workspace !== undefined ? { workspace } : {}),
  };
}

function nonEmptySelector(value: string | undefined, flag: string): string | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "")
    throw usage(`--${flag} needs a value`, "pass an exact retained snapshot key or unambiguous commit");
  return value.trim();
}

function retainedCounts(
  snapshot: RetainedSnapshot,
  repositories: readonly string[],
): ExplorerSnapshot["health"]["counts"] {
  const selected = new Set(repositories);
  const facts = snapshot.facts.filter(
    (fact) => selected.size === 0 || (fact.provenance.memberId !== null && selected.has(fact.provenance.memberId)),
  );
  const edgeFingerprints = new Set<string>();
  let danglingEdges = 0;
  let duplicateEdges = 0;
  for (const fact of facts) {
    if (fact.kind !== "edge") continue;
    if (fact.value.dangling === true) danglingEdges += 1;
    const fingerprint = [fact.value.from, fact.value.kind, fact.value.target].join("\0");
    if (edgeFingerprints.has(fingerprint)) duplicateEdges += 1;
    edgeFingerprints.add(fingerprint);
  }
  return {
    repositories:
      selected.size === 0
        ? snapshot.repositories.length
        : snapshot.repositories.filter(
            (repository) => repository.memberId !== null && selected.has(repository.memberId),
          ).length,
    concepts: facts.filter((fact) => fact.kind === "concept").length,
    tasks: facts.filter((fact) => fact.kind === "task").length,
    authoredEdges: facts.filter((fact) => fact.kind === "edge").length,
    danglingEdges,
    duplicateEdges,
  };
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
