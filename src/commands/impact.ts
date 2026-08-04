/** `lore impact`: bounded deterministic impact expansion across exact authored typed edges. */

import type { BacklogAdapter } from "../adapters/backlog";
import { loadRetrievalGraph, type RetrievalGraphLoader } from "../core/retrieval";
import { findImpact } from "../core/traversal";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext } from "../output";
import { parseCommandArgs, usage, workspaceSelection } from "./args";
import {
  assertKnownEdgeKinds,
  impactRenderable,
  normalizeEndpointId,
  parseEndpointKind,
  parseTraversalFlags,
} from "./traversal";

export interface ImpactCommandOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
  readonly stderr?: Writer;
  readonly adapter?: BacklogAdapter;
  readonly retrieval?: RetrievalGraphLoader;
}

export async function runImpact(options: ImpactCommandOptions): Promise<number> {
  const parsed = parseCommandArgs(options.args, "impact");
  const workspace = workspaceSelection(parsed);
  if (parsed.positionals.length !== 1) {
    throw usage("impact needs exactly one <id>", "run `lore impact <id> --kind <kind> --direction <direction>`");
  }
  const kind = parseEndpointKind(parsed, "kind");
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
    const data = findImpact(loaded.traversal, {
      root: {
        kind,
        id: normalizeEndpointId(parsed.positionals[0] as string, kind, workspace !== undefined),
      },
      ...flags,
    });
    emit(impactRenderable(data), options.output, options.stdout);
    return EXIT_OK;
  } finally {
    await loaded.dispose?.();
  }
}
