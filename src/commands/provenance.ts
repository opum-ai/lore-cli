/** `lore provenance`: exact retained-snapshot record evidence. */

import type { BacklogAdapter } from "../adapters/backlog";
import { findRetainedProvenance, type ProvenanceResult, type RetainedFactKind } from "../core/snapshot";
import { resolveSnapshotScope } from "../core/snapshot-runtime";
import type { SnapshotScopeSelection } from "../core/snapshot-store";
import { loadSnapshot } from "../core/snapshot-store";
import { WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, singleOptionValue, usage, workspaceSelection } from "./args";

export interface ProvenanceCommandOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
  readonly stderr?: Writer;
  readonly adapter?: BacklogAdapter;
  readonly resolveScope?: () => SnapshotScopeSelection | Promise<SnapshotScopeSelection>;
}

export async function runProvenance(options: ProvenanceCommandOptions): Promise<number> {
  const parsed = parseCommandArgs(options.args, "provenance");
  const workspace = workspaceSelection(parsed);
  if (parsed.positionals.length !== 1)
    throw usage("provenance needs exactly one <id>", "run `lore provenance <id> --kind <kind> --snapshot <selector>`");
  const kind = parseKind(singleOptionValue(parsed, "kind"));
  const selector = singleOptionValue(parsed, "snapshot");
  if (selector === undefined || selector.trim() === "")
    throw usage("--snapshot needs a value", "pass an exact retained snapshot key or unambiguous commit");
  const advisories = new WarningCollector();
  const selection = workspace === undefined ? {} : { workspace: workspace.manifestPath };
  const scope =
    options.resolveScope === undefined
      ? await resolveSnapshotScope({ root: options.root, selection, warnings: advisories, adapter: options.adapter })
      : await options.resolveScope();
  const snapshot = loadSnapshot(options.root, scope, selector.trim());
  const data = findRetainedProvenance(snapshot, {
    id: parsed.positionals[0] as string,
    kind,
    repositories: workspace?.memberIds ?? [],
  });
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  emit(provenanceRenderable(data), options.output, options.stdout);
  return 0;
}

function parseKind(value: string | undefined): RetainedFactKind {
  if (value !== "concept" && value !== "task" && value !== "edge")
    throw usage("--kind must be concept, task, or edge", "pass the retained fact kind explicitly");
  return value;
}

function provenanceRenderable(data: ProvenanceResult): Renderable<ProvenanceResult> {
  return { kind: "provenance.result", data, pretty: renderProvenance, plain: renderProvenance };
}

function renderProvenance(data: ProvenanceResult): string {
  const source = data.fact.provenance;
  return [
    `${data.fact.kind} ${data.fact.id} @ ${data.snapshot.snapshotKey}`,
    `repository ${source.memberId ?? source.repositoryScopeKey}`,
    `commit ${source.gitCommit ?? "uncommitted"}`,
    `export ${source.exportDigest}`,
    `record ${source.recordKey}`,
    `source ${source.sourcePath ?? "none"}`,
  ].join("\n");
}
