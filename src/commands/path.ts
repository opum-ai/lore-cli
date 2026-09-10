/** `lore path`: bounded deterministic paths across exact authored typed edges. */

import type { BacklogAdapter } from "../adapters/backlog";
import { loadRetrievalGraph, type RetrievalGraphLoader } from "../core/retrieval";
import { findPaths } from "../core/traversal";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext } from "../output";
import { parseCommandArgs, usage, workspaceSelection } from "./args";
import {
  assertKnownEdgeKinds,
  normalizeEndpointId,
  parseEndpointKind,
  parseTraversalFlags,
  pathRenderable,
} from "./traversal";

export interface PathCommandOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
  readonly stderr?: Writer;
  readonly adapter?: BacklogAdapter;
  readonly retrieval?: RetrievalGraphLoader;
}

export async function runPath(options: PathCommandOptions): Promise<number> {
  const parsed = parseCommandArgs(options.args, "path");
  const workspace = workspaceSelection(parsed);
  if (parsed.positionals.length !== 2) {
    throw usage(
      "path needs exactly <from> and <to>",
      "run `lore path <from> <to> --from-kind <kind> --to-kind <kind> --direction <direction>`",
    );
  }
  const fromKind = parseEndpointKind(parsed, "from-kind");
  const toKind = parseEndpointKind(parsed, "to-kind");
  const flags = parseTraversalFlags(parsed);
  const advisories = new WarningCollector();
  const loaded = await (options.retrieval ?? loadRetrievalGraph)({
    root: options.root,
    warnings: advisories,
    adapter: options.adapter,
    includeTraversal: true,
    ...(workspace !== undefined ? { workspace } : {}),
  });
  try {
    advisories.flush({ color: options.output.color, stderr: options.stderr });
    if (loaded.traversal === undefined) throw new LoreError("validation", "traversal snapshot was not loaded");
    assertKnownEdgeKinds(loaded.traversal, flags.edgeKinds);
    const data = findPaths(loaded.traversal, {
      from: {
        kind: fromKind,
        id: normalizeEndpointId(parsed.positionals[0] as string, fromKind, workspace !== undefined),
      },
      to: {
        kind: toKind,
        id: normalizeEndpointId(parsed.positionals[1] as string, toKind, workspace !== undefined),
      },
      ...flags,
    });
    emit(pathRenderable(data), options.output, options.stdout);
    return EXIT_OK;
  } finally {
    await loaded.dispose?.();
  }
}
