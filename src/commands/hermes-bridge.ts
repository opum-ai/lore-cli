import { dirname, join } from "node:path";
import type { BridgeAction } from "../core/agent-bridge";
import { HERMES_CONTEXT_REL_PATH, planHermesBridge } from "../core/hermes-bridge";
import { readFileIfPresent } from "../errors";
import { assertNoSymlinkInAnyPath, ensureDir, writeFileAtomic } from "./fswrite";

export interface HermesBridgeResult {
  root: string;
  files: ReadonlyArray<{ path: string; action: BridgeAction }>;
}

/** Apply the project-local Hermes context bridge without accessing Hermes user configuration. */
export function applyHermesBridge(options: { root: string; force: boolean; check: boolean }): HermesBridgeResult {
  const raw = readFileIfPresent(join(options.root, HERMES_CONTEXT_REL_PATH), HERMES_CONTEXT_REL_PATH);
  const contextOnDisk = raw === undefined ? null : raw.replace(/^\uFEFF+/, "").replace(/\r\n?/g, "\n");
  const plan = planHermesBridge({ contextOnDisk, force: options.force, check: options.check });
  if (!options.check) {
    const targets = plan.files.filter((file) => file.contents !== null).map((file) => file.path);
    assertNoSymlinkInAnyPath(options.root, targets);
    for (const file of plan.files) {
      if (file.contents === null) continue;
      ensureDir(options.root, dirname(file.path));
      writeFileAtomic(join(options.root, file.path), file.contents, file.path);
    }
  }
  return { root: options.root, files: plan.files.map(({ path, action }) => ({ path, action })) };
}
