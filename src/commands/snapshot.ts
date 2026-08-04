/** `lore snapshot`: explicit retained projection lifecycle. */

import type { BacklogAdapter } from "../adapters/backlog";
import type { RetainedSnapshot, RetainedSnapshotDescriptor } from "../core/snapshot";
import {
  loadCurrentRetainedSnapshot,
  resolveSnapshotScope,
  type SnapshotRuntimeSelection,
} from "../core/snapshot-runtime";
import type { SnapshotScopeSelection } from "../core/snapshot-store";
import { deleteSnapshots, listSnapshots, retainSnapshot } from "../core/snapshot-store";
import { WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { assertFlagAtMostOnce, parseCommandArgs, singleOptionValue, usage } from "./args";

export interface SnapshotCommandOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
  readonly stderr?: Writer;
  readonly adapter?: BacklogAdapter;
  readonly loadCurrentSnapshot?: () => RetainedSnapshot | Promise<RetainedSnapshot>;
  readonly resolveScope?: () => SnapshotScopeSelection | Promise<SnapshotScopeSelection>;
}

type SnapshotCommandResult =
  | {
      readonly action: "retained" | "unchanged";
      readonly snapshot: RetainedSnapshotDescriptor;
      readonly retained: number;
      readonly maximum: number;
    }
  | {
      readonly action: "listed";
      readonly snapshots: readonly RetainedSnapshotDescriptor[];
      readonly retained: number;
      readonly maximum: number;
    }
  | { readonly action: "deleted"; readonly deleted: readonly string[] };

export async function runSnapshot(options: SnapshotCommandOptions): Promise<number> {
  const parsed = parseCommandArgs(options.args, "snapshot");
  assertFlagAtMostOnce(parsed, "all");
  const action = parsed.positionals[0];
  if (action !== "retain" && action !== "list" && action !== "delete") {
    throw usage("snapshot needs retain, list, or delete", "run `lore snapshot <retain|list|delete> [snapshot-key]`");
  }
  const selection = runtimeSelection(parsed);
  const advisories = new WarningCollector();
  let result: SnapshotCommandResult;
  if (action === "retain") {
    if (parsed.positionals.length !== 1 || parsed.flags.has("all") || selection.workspaceId !== undefined) {
      throw usage(
        "snapshot retain accepts no snapshot key, --all, or --workspace-id",
        "retain the current repository or --workspace manifest snapshot",
      );
    }
    const snapshot =
      options.loadCurrentSnapshot === undefined
        ? await loadCurrentRetainedSnapshot({
            root: options.root,
            selection,
            warnings: advisories,
            adapter: options.adapter,
          })
        : await options.loadCurrentSnapshot();
    result = retainSnapshot(options.root, snapshot);
  } else if (action === "list") {
    if (parsed.positionals.length !== 1 || parsed.flags.has("all"))
      throw usage("snapshot list accepts no snapshot key or --all", "run `lore snapshot list`");
    const scope =
      options.resolveScope === undefined
        ? await resolveSnapshotScope({ root: options.root, selection, warnings: advisories, adapter: options.adapter })
        : await options.resolveScope();
    const snapshots = listSnapshots(options.root, scope);
    result = { action: "listed", snapshots, retained: snapshots.length, maximum: 16 };
  } else {
    if (parsed.positionals.length > 2)
      throw usage("snapshot delete accepts one snapshot key", "pass one exact snapshot key or --all");
    const key = parsed.positionals[1];
    if ((key === undefined) !== parsed.flags.has("all"))
      throw usage("snapshot delete needs exactly one snapshot key or --all", "choose one explicit deletion scope");
    const scope =
      options.resolveScope === undefined
        ? await resolveSnapshotScope({ root: options.root, selection, warnings: advisories, adapter: options.adapter })
        : await options.resolveScope();
    const deleted = deleteSnapshots(options.root, scope, {
      ...(key !== undefined ? { snapshotKey: key } : {}),
      ...(parsed.flags.has("all") ? { all: true } : {}),
    });
    result = { action: "deleted", deleted: deleted.deleted };
  }
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  emit(snapshotRenderable(result), options.output, options.stdout);
  return 0;
}

function runtimeSelection(parsed: ReturnType<typeof parseCommandArgs>): SnapshotRuntimeSelection {
  const workspace = singleOptionValue(parsed, "workspace")?.trim();
  const workspaceId = singleOptionValue(parsed, "workspace-id")?.trim();
  if (workspace === "" || workspaceId === "")
    throw usage("workspace selectors need a value", "pass a non-empty manifest path or workspace id");
  if (workspace !== undefined && workspaceId !== undefined)
    throw usage("--workspace and --workspace-id are mutually exclusive", "select one workspace scope");
  return { ...(workspace !== undefined ? { workspace } : {}), ...(workspaceId !== undefined ? { workspaceId } : {}) };
}

function snapshotRenderable(data: SnapshotCommandResult): Renderable<SnapshotCommandResult> {
  return { kind: "snapshot.result", data, pretty: renderSnapshot, plain: renderSnapshot };
}

function renderSnapshot(data: SnapshotCommandResult): string {
  if (data.action === "listed") {
    return data.snapshots.length === 0
      ? `0 retained snapshots (maximum ${data.maximum})`
      : [
          `${data.retained} retained snapshots (maximum ${data.maximum})`,
          ...data.snapshots.map(
            (snapshot) =>
              `${snapshot.snapshotKey} ${snapshot.scopeKind} ${snapshot.repositories.map((repository) => repository.gitCommit ?? "uncommitted").join(",")}`,
          ),
        ].join("\n");
  }
  if (data.action === "deleted")
    return data.deleted.length === 0
      ? "deleted 0 retained snapshots"
      : data.deleted.map((key) => `deleted ${key}`).join("\n");
  return `${data.action} ${data.snapshot.snapshotKey} (${data.retained}/${data.maximum})`;
}
