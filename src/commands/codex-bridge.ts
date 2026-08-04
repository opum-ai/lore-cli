import { dirname, join } from "node:path";
import type { BridgeAction } from "../core/agent-bridge";
import { AGENTS_MD_REL_PATH, CODEX_SKILL_REL_PATH, planCodexBridge } from "../core/codex-bridge";
import { readFileIfPresent } from "../errors";
import { assertNoSymlinkInAnyPath, ensureDir, writeFileAtomic } from "./fswrite";

export interface CodexBridgeResult {
  root: string;
  files: ReadonlyArray<{ path: string; action: BridgeAction }>;
}

export function applyCodexBridge(options: { root: string; force: boolean; check: boolean }): CodexBridgeResult {
  const skillRaw = readFileIfPresent(join(options.root, CODEX_SKILL_REL_PATH), CODEX_SKILL_REL_PATH);
  const agentsRaw = readFileIfPresent(join(options.root, AGENTS_MD_REL_PATH), AGENTS_MD_REL_PATH);
  const skillOnDisk = normalize(skillRaw);
  const agentsOnDisk = normalize(agentsRaw);
  const agentsStyle = detectStyle(agentsRaw);
  const plan = planCodexBridge({ skillOnDisk, agentsOnDisk, force: options.force, check: options.check });

  if (!options.check) {
    const targets = plan.files.filter((file) => file.contents !== null).map((file) => file.path);
    assertNoSymlinkInAnyPath(options.root, targets);
    for (const file of plan.files) {
      if (file.contents === null) continue;
      ensureDir(options.root, dirname(file.path));
      const contents = file.path === AGENTS_MD_REL_PATH ? restyle(file.contents, agentsStyle) : file.contents;
      writeFileAtomic(join(options.root, file.path), contents, file.path);
    }
  }

  return { root: options.root, files: plan.files.map(({ path, action }) => ({ path, action })) };
}

function normalize(raw: string | undefined): string | null {
  return raw === undefined ? null : raw.replace(/^\uFEFF+/, "").replace(/\r\n?/g, "\n");
}

function detectStyle(raw: string | undefined): { bom: boolean; eol: "\n" | "\r\n" | "\r" } {
  if (raw === undefined) return { bom: false, eol: "\n" };
  return {
    bom: raw.startsWith("\uFEFF"),
    eol: raw.includes("\r\n") ? "\r\n" : raw.includes("\r") ? "\r" : "\n",
  };
}

function restyle(contents: string, style: { bom: boolean; eol: "\n" | "\r\n" | "\r" }): string {
  const withEol = style.eol === "\n" ? contents : contents.replace(/\n/g, style.eol);
  return style.bom ? `\uFEFF${withEol}` : withEol;
}
