import { dirname, join } from "node:path";
import type { BridgeAction } from "../core/agent-bridge";
import { GEMINI_MD_REL_PATH, planAntigravityBridge } from "../core/antigravity-bridge";
import { readFileIfPresent } from "../errors";
import { assertNoSymlinkInAnyPath, ensureDir, writeFileAtomic } from "./fswrite";

export interface AntigravityBridgeResult {
  root: string;
  files: ReadonlyArray<{ path: string; action: BridgeAction }>;
}

const BOM_PATTERN = new RegExp(`^${String.fromCharCode(0xfeff)}+`);

/** Apply the project-local Antigravity/Gemini CLI context bridge (GEMINI.md), mirroring {@link applyHermesBridge}. */
export function applyAntigravityBridge(options: {
  root: string;
  force: boolean;
  check: boolean;
}): AntigravityBridgeResult {
  const raw = readFileIfPresent(join(options.root, GEMINI_MD_REL_PATH), GEMINI_MD_REL_PATH);
  const contextOnDisk = raw === undefined ? null : raw.replace(BOM_PATTERN, "").replace(/\r\n?/g, "\n");
  const plan = planAntigravityBridge({ contextOnDisk, force: options.force, check: options.check });
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
