/** `lore changed`: bounded deterministic retained-snapshot comparison. */

import type { BacklogAdapter } from "../adapters/backlog";
import { type ChangedResult, compareRetainedSnapshots, type RetainedFactKind } from "../core/snapshot";
import { resolveSnapshotScope } from "../core/snapshot-runtime";
import type { SnapshotScopeSelection } from "../core/snapshot-store";
import { loadSnapshot } from "../core/snapshot-store";
import { WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { optionValues, parseCommandArgs, singleOptionValue, usage, workspaceSelection } from "./args";

export interface ChangedCommandOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
  readonly stderr?: Writer;
  readonly adapter?: BacklogAdapter;
  readonly resolveScope?: () => SnapshotScopeSelection | Promise<SnapshotScopeSelection>;
}

export async function runChanged(options: ChangedCommandOptions): Promise<number> {
  const parsed = parseCommandArgs(options.args, "changed");
  const workspace = workspaceSelection(parsed);
  if (parsed.positionals.length !== 2)
    throw usage("changed needs exactly <from> and <to>", "run `lore changed <from> <to> [--workspace <manifest>]`");
  const limit = parseLimit(singleOptionValue(parsed, "limit"));
  const kinds = optionValues(parsed, "kind").map(parseKind);
  const advisories = new WarningCollector();
  const selection = workspace === undefined ? {} : { workspace: workspace.manifestPath };
  const scope =
    options.resolveScope === undefined
      ? await resolveSnapshotScope({ root: options.root, selection, warnings: advisories, adapter: options.adapter })
      : await options.resolveScope();
  const from = loadSnapshot(options.root, scope, parsed.positionals[0] as string);
  const to = loadSnapshot(options.root, scope, parsed.positionals[1] as string);
  const data = compareRetainedSnapshots(from, to, {
    limit,
    repositories: workspace?.memberIds ?? [],
    ...(kinds.length > 0 ? { kinds } : {}),
  });
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  emit(changedRenderable(data), options.output, options.stdout);
  return 0;
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^[0-9]+$/u.test(raw)) throw usage("--limit must be an integer", "pass a value from 1 through 1000");
  return Number(raw);
}

function parseKind(value: string): RetainedFactKind {
  if (value !== "concept" && value !== "task" && value !== "edge")
    throw usage(`unknown changed kind ${JSON.stringify(value)}`, "use concept, task, or edge");
  return value;
}

function changedRenderable(data: ChangedResult): Renderable<ChangedResult> {
  return { kind: "changed.result", data, pretty: renderChanged, plain: renderChanged };
}

function renderChanged(data: ChangedResult): string {
  const header = `changed ${data.from.snapshotKey}..${data.to.snapshotKey}: ${data.totalChanges} changes, ${data.shown} shown${data.truncated ? " (truncated)" : ""}`;
  const rows = data.changes.map(
    (change) =>
      `${change.change} ${change.recordKind} ${change.id}${change.fieldsChanged.length > 0 ? ` [${change.fieldsChanged.join(",")}]` : ""}`,
  );
  return [header, ...rows].join("\n");
}
