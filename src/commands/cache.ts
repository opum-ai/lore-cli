/** `lore cache clear <path>`: owner-invoked removal of one checkout's read-only `.lore/cache` (LCLI-740). */

import { resolve } from "node:path";
import { type ClearCheckoutCacheResult, clearCheckoutCache } from "../core/ladybug-lifecycle";
import type { Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, usage } from "./args";

export interface CacheCommandOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
}

export async function runCache(options: CacheCommandOptions): Promise<number> {
  const parsed = parseCommandArgs(options.args, "cache");
  if (parsed.positionals[0] !== "clear" || parsed.positionals.length !== 2) {
    throw usage("cache needs `clear <path>`", "run `lore cache clear <checkout-path>`");
  }
  const result = clearCheckoutCache(resolve(options.root, parsed.positionals[1] as string));
  const renderable: Renderable<ClearCheckoutCacheResult> = {
    kind: "cache.result",
    data: result,
    pretty: renderCache,
    plain: renderCache,
  };
  emit(renderable, options.output, options.stdout);
  return 0;
}

function renderCache(data: ClearCheckoutCacheResult): string {
  if (data.action === "cleared") return `cleared ${data.path}`;
  return `nothing to clear: ${data.reason ?? `${data.path} does not exist`}`;
}
