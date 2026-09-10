/** Source-loading boundary shared by snapshot/change/provenance commands. */

import type { BacklogAdapter } from "../adapters/backlog";
import type { WarningCollector } from "../errors";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "./ladybug-native";
import { loadLadybugProjectionSource } from "./ladybug-source";
import { buildRepositoryRetainedSnapshot, buildWorkspaceRetainedSnapshot, type RetainedSnapshot } from "./snapshot";
import type { SnapshotScopeSelection } from "./snapshot-store";
import { workspaceKeyForId } from "./workspace-contract";
import { loadWorkspaceProjection } from "./workspace-source";

export interface SnapshotRuntimeSelection {
  readonly workspace?: string;
  readonly workspaceId?: string;
}

export async function loadCurrentRetainedSnapshot(options: {
  readonly root: string;
  readonly selection: SnapshotRuntimeSelection;
  readonly warnings?: WarningCollector;
  readonly adapter?: BacklogAdapter;
}): Promise<RetainedSnapshot> {
  if (options.selection.workspace !== undefined) {
    const loaded = await loadWorkspaceProjection({
      root: options.root,
      manifestPath: options.selection.workspace,
      warnings: options.warnings,
    });
    return buildWorkspaceRetainedSnapshot(loaded.projection);
  }
  const source = await loadLadybugProjectionSource({
    root: options.root,
    ladybugVersion: EXPECTED_LADYBUG_VERSION,
    ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    adapter: options.adapter,
    warnings: options.warnings,
  });
  return buildRepositoryRetainedSnapshot(source);
}

export async function resolveSnapshotScope(options: {
  readonly root: string;
  readonly selection: SnapshotRuntimeSelection;
  readonly warnings?: WarningCollector;
  readonly adapter?: BacklogAdapter;
}): Promise<SnapshotScopeSelection> {
  if (options.selection.workspaceId !== undefined) {
    return { kind: "workspace", scopeKey: workspaceKeyForId(options.selection.workspaceId) };
  }
  const current = await loadCurrentRetainedSnapshot(options);
  return { kind: current.scopeKind, scopeKey: current.scopeKey };
}
